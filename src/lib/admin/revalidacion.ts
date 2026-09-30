import { resolveSiteUrl } from "@/lib/site-url";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * A QUÉ DOMINIOS HAY QUE PEDIRLE A VERCEL QUE REGENERE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Vive fuera de la ruta porque decide a quién se le manda el token de
 * revalidación, y eso merece comprobarse con tests en vez de en producción.
 */

/** `https://host`, sin slash final, o null si no hay nada utilizable. */
export function normalizar(valor: string | undefined | null): string | null {
  if (valor === undefined || valor === null || valor === "") return null;
  const limpio = valor.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (limpio === "") return null;
  return limpio.startsWith("localhost") ? `http://${limpio}` : `https://${limpio}`;
}

/**
 * Todos los dominios en los que ESTE deploy responde.
 *
 * Es una lista y no una URL porque un mismo deploy se sirve por varios alias
 * a la vez, y CADA UNO tiene su propia caché de ISR.
 *
 * ── Por qué hace falta mirar la petición ──────────────────────────────────
 *
 * Las variables de Vercel NO alcanzan. Un dominio asignado a mano al entorno
 * Preview —salvame-el-pc.vercel.app apuntando a la rama testing, por
 * ejemplo— no aparece en VERCEL_URL, ni en VERCEL_BRANCH_URL, ni en
 * VERCEL_PROJECT_PRODUCTION_URL. Ninguna variable lo nombra.
 *
 * Costó encontrarlo: el panel publicaba de verdad, en el alias largo de la
 * rama, mientras quien editaba miraba el alias corto y no veía su cambio
 * jamás. El único que conoce ese dominio es el navegador que está editando,
 * así que se toma de su propia petición.
 *
 * ── Por qué esto NO es confiar en el header Host ──────────────────────────
 *
 * El Host lo controla quien llama, y mandarle el token de revalidación a un
 * dominio ajeno sería regalarlo. Por eso el origen solo se acepta si es un
 * *.vercel.app o coincide con un dominio que las variables ya declaran. Un
 * Host inventado se descarta. Y antes de todo esto, el endpoint ya exigió
 * sesión de admin.
 */
export function dominiosDelProyecto(request: Request): string[] {
  const deVariables = [
    process.env.PUBLIC_SITE_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
    /*
     * El dominio de producción entra SOLO si este deploy es el de
     * producción. Desde un preview apunta a otro build, con su propia caché
     * y su propio código: revalidarlo sería tocar un sitio ajeno al cambio
     * que se acaba de guardar.
     */
    process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : undefined,
  ]
    .map(normalizar)
    .filter((x): x is string => x !== null);

  // El dominio desde el que se editó.
  const origen = normalizar(request.headers.get("x-forwarded-host") ?? new URL(request.url).host);

  const aceptable =
    origen !== null &&
    (deVariables.includes(origen) ||
      /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origen) ||
      origen.startsWith("http://localhost"));

  const todos = aceptable && origen !== null ? [origen, ...deVariables] : deVariables;
  const unicos = [...new Set(todos)];

  // Sin nada de lo anterior —desarrollo local sin variables— se cae a la
  // resolución de siempre, que lanza con un mensaje claro si tampoco hay.
  return unicos.length > 0 ? unicos : [resolveSiteUrl()];
}

export function seRegenero(respuesta: Response): boolean {
  const estado = respuesta.headers.get("x-vercel-cache");

  if (estado === null) return respuesta.status < 500;
  return estado === "REVALIDATED" || estado === "MISS" || estado === "PRERENDER";
}
