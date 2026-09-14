import type { APIRoute } from "astro";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { dominiosDelProyecto, seRegenero } from "@/lib/admin/revalidacion";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * PUBLICAR — fuerza a Vercel a regenerar las páginas cacheadas
 * ─────────────────────────────────────────────────────────────────────────
 *
 * El sitio se sirve con ISR: Vercel guarda el HTML ya renderizado y lo
 * reparte sin volver a consultar Supabase hasta que expira. Rápido, pero
 * significa que un cambio de precio tardaría en verse.
 *
 * Este endpoint le pide a Vercel que rehaga cada página ahora. El mecanismo
 * es una cabecera `x-prerender-revalidate` con el token que se definió en el
 * build (ver `bypassToken` en astro.config.mjs).
 *
 * ── Por qué exige sesión ──────────────────────────────────────────────────
 *
 * Sin autenticación, cualquiera podría llamarlo en bucle y obligar al sitio
 * a regenerarse en cada petición: el ISR dejaría de servir de nada y cada
 * visita pasaría a consultar la base. Es una forma barata de tumbar el sitio
 * y de agotar la cuota del plan.
 *
 * El token JAMÁS sale de acá. El panel no lo conoce: pide la revalidación y
 * es el servidor quien lo usa. Si el navegador lo tuviera, quien abriera las
 * devtools podría hacer lo de arriba sin siquiera tener sesión.
 */
export const prerender = false;

const json = (data: unknown, status: number): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

/** Rutas fijas del sitio. Las fichas de producto se agregan dinámicamente. */
const RUTAS_FIJAS = ["/", "/tienda", "/404"];

/**
 * ¿Vercel rehízo de verdad esta página?
 *
 * La respuesta la da la cabecera `x-vercel-cache`, no el código de estado, y
 * la diferencia importa por dos motivos que se descubrieron en QA:
 *
 *   · Mirar `response.ok` daba por fallida la página /404, que responde 404
 *     porque ESA es su función. El panel decía "se publicaron 14 de 15"
 *     cada vez, aunque todo hubiera salido bien, y eso entrena a desconfiar
 *     de un aviso que algún día va a ser cierto.
 *
 *   · Peor: un 200 no prueba nada. Si el token no estuviera en el build,
 *     Vercel ignoraría la cabecera y devolvería la página CACHEADA con un
 *     200 tranquilizador. El panel habría cantado victoria mientras el
 *     sitio seguía mostrando el precio viejo — que es exactamente el fallo
 *     que uno necesita que se note.
 *
 * REVALIDATED = se rehizo. MISS / PRERENDER = no había caché y se generó
 * ahora. Sin la cabecera no estamos en Vercel (un `astro dev` local), y ahí
 * basta con que la página no reviente.
 */
export const POST: APIRoute = async ({ request }) => {
  // ── 1. ¿Hay una sesión de admin detrás de esto? ────────────────────────
  const cabecera = request.headers.get("authorization") ?? "";
  const token = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "";

  if (token === "") {
    return json({ error: "Falta la sesión." }, 401);
  }

  const admin = getSupabaseAdmin();
  const { data: usuario, error: fallo } = await admin.auth.getUser(token);

  if (fallo !== null || usuario.user === null) {
    return json({ error: "Sesión inválida o expirada. Vuelve a entrar." }, 401);
  }

  // ── 2. ¿Está configurado el token de Vercel? ───────────────────────────
  const bypass = process.env.VERCEL_REVALIDATE_TOKEN;

  if (bypass === undefined || bypass === "") {
    // No es un error del panel: es configuración que falta. Se responde 200
    // con el aviso para que la interfaz pueda explicarlo en vez de mostrar
    // un fallo rojo por algo que no rompió nada — los cambios igual se ven
    // cuando expire el caché.
    return json(
      {
        ok: false,
        motivo: "sin-token",
        mensaje:
          "Falta VERCEL_REVALIDATE_TOKEN en el deploy. Los cambios se verán igual cuando expire el caché.",
      },
      200,
    );
  }

  // ── 3. Qué páginas hay que rehacer ─────────────────────────────────────
  //
  // Se revalida el sitio entero y no solo lo que cambió. Podría parecer
  // excesivo, pero un ajuste global —el nombre, el cintillo, el costo de
  // envío— aparece en TODAS las páginas, y adivinar cuáles tocar es
  // exactamente el tipo de optimización que deja una página vieja sin que
  // nadie se entere. Son unas quince URLs.
  const { data: productos } = await admin
    .from("products")
    .select("slug")
    .eq("is_published", true)
    .returns<{ slug: string }[]>();

  const rutas = [...RUTAS_FIJAS, ...(productos ?? []).map((p) => `/producto/${p.slug}`)];

  // ── 4. Pedirle a Vercel que las rehaga, en TODOS sus dominios ──────────
  const bases = dominiosDelProyecto(request);

  const resultados = await Promise.all(
    bases.flatMap((base) =>
      rutas.map(async (ruta) => {
        try {
          const respuesta = await fetch(`${base}${ruta}`, {
            headers: { "x-prerender-revalidate": bypass },
          });
          return { ruta: `${base}${ruta}`, ok: seRegenero(respuesta) };
        } catch {
          // Una ruta que falla no puede abortar las demás: es mejor publicar
          // catorce de quince que ninguna.
          return { ruta: `${base}${ruta}`, ok: false };
        }
      }),
    ),
  );

  const fallidas = resultados.filter((r) => !r.ok).map((r) => r.ruta);

  if (fallidas.length > 0) {
    console.error("[revalidar] rutas que no se pudieron regenerar", fallidas);
  }

  return json(
    {
      ok: fallidas.length === 0,
      total: rutas.length,
      publicadas: rutas.length - fallidas.length,
      ...(fallidas.length > 0 ? { fallidas } : {}),
    },
    200,
  );
};
