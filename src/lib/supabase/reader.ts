import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * CLIENTE DE LECTURA DEL SITIO PÚBLICO
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Usa la clave PÚBLICA, no la service role, y esa es la decisión importante
 * de este archivo.
 *
 * Con la service role el sitio vería todo: productos despublicados, páginas
 * en borrador y los datos personales de cada comprador. Un `select` mal
 * escrito —o un componente que reciba más columnas de las que muestra—
 * bastaría para filtrar algo. Con la clave pública eso es imposible: el RLS
 * de supabase/schema.sql solo devuelve lo publicado, y los pedidos no los
 * devuelve nunca.
 *
 * Dicho de otro modo: el sitio público ve exactamente lo mismo que vería
 * cualquiera con la clave que viaja en el navegador. Es la misma superficie
 * que `pnpm check:supabase` verifica en cada corrida.
 */

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `[supabase] Falta la variable de entorno ${name}. ` +
        `Sin ella el sitio no puede leer el catálogo ni los textos. ` +
        `Revisa .env en local o el environment del deploy en Vercel.`,
    );
  }
  return value;
}

let cached: SupabaseClient | null = null;

export function getSupabaseReader(): SupabaseClient {
  if (cached !== null) return cached;

  cached = createClient(required("SUPABASE_URL"), required("SUPABASE_ANON_KEY"), {
    // No hay usuario detrás de estas lecturas y no existe dónde persistir
    // una sesión en el servidor.
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}

/**
 * Memoriza una lectura durante unos segundos.
 *
 * No es una caché de rendimiento —de eso se encarga el ISR de Vercel, que
 * guarda la página YA renderizada—. Es para que, dentro de un mismo
 * renderizado, el layout, el header y el footer no pidan los ajustes del
 * sitio tres veces cada uno.
 *
 * La ventana es corta a propósito: con una caché larga, publicar un cambio
 * desde el panel seguiría mostrando lo viejo hasta que Vercel reciclara la
 * función, y eso es imposible de explicar. Cinco segundos alcanzan para
 * deduplicar un render y no para que nadie note un retraso.
 */
export function memoizarBreve<T>(cargar: () => Promise<T>, ms = 5000): () => Promise<T> {
  let enCurso: Promise<T> | null = null;
  let expira = 0;

  return () => {
    const ahora = Date.now();
    if (enCurso !== null && ahora < expira) return enCurso;

    expira = ahora + ms;
    enCurso = cargar().catch((error: unknown) => {
      // Un fallo no se queda cacheado: si la base parpadea, el siguiente
      // render tiene que poder volver a intentarlo.
      enCurso = null;
      expira = 0;
      throw error;
    });

    return enCurso;
  };
}
