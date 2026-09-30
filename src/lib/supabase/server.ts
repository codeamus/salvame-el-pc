import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * CLIENTE DE SUPABASE PARA EL SERVIDOR — ⚠️ PASA POR ENCIMA DE TODO EL RLS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Usa la service role key, así que ve y escribe absolutamente todo: los
 * datos personales de cada comprador incluidos. Solo puede importarse desde
 * `src/pages/api/**`, que corre en el servidor.
 *
 * Importarlo desde un componente —aunque sea sin usarlo— mete la clave en
 * el bundle del navegador y regala la base entera. La única defensa real es
 * que la variable NO lleva prefijo PUBLIC_: Astro no expone al cliente
 * ninguna que no lo tenga, así que un import equivocado revienta en build
 * con "falta la variable" en vez de filtrar el secreto en silencio.
 *
 * Ninguna variable de Supabase lleva ese prefijo, ni siquiera la clave
 * pública: ver la explicación en .env.example.
 *
 * Para leer catálogo o contenido publicado NO se usa esto: se usa la clave
 * pública, que es la que el RLS de supabase/schema.sql está diseñado para
 * contener.
 */

/**
 * Lee una variable de entorno.
 *
 * SOLO de process.env, y eso es deliberado. Astro carga el .env sin filtro
 * de prefijo, así que Vite define `import.meta.env` como un objeto que lleva
 * TODAS las variables privadas adentro: mencionarlo en un módulo del
 * servidor basta para que los secretos queden escritos en claro dentro del
 * bundle compilado. Ver el comentario largo en astro.config.mjs, que es
 * donde el .env se vuelca a process.env para que esto funcione igual en
 * `astro dev` y dentro de una función de Vercel.
 */
function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value !== undefined && value !== "" ? value : undefined;
}

function required(name: string): string {
  const value = readEnv(name);
  if (value === undefined) {
    throw new Error(
      `[supabase] Falta la variable de entorno ${name}. ` +
        `Revisa .env en local o el environment del deploy en Vercel.`,
    );
  }
  return value;
}

let cached: SupabaseClient | null = null;

/**
 * Cliente admin, creado una sola vez por instancia.
 *
 * Es perezoso y no un `const` de módulo a propósito: así importar este
 * archivo no explota en build por una variable que solo existe en runtime.
 *
 * Sin sesión ni refresco de token: no hay usuario detrás de la service role
 * key, y `persistSession` intentaría escribir en un localStorage que en el
 * servidor no existe.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached !== null) return cached;

  cached = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}
