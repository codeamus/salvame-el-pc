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
 * Acceso ESTÁTICO a import.meta.env, una variable por línea.
 *
 * Mismo motivo que en src/lib/tuu/env.ts: Vite reemplaza la expresión
 * literal en tiempo de build. Un acceso dinámico no se reemplaza nunca y
 * devuelve undefined para toda variable sin prefijo PUBLIC_, con un error
 * imposible de diagnosticar aunque el .env esté perfecto.
 */
const STATIC_ENV: Readonly<Record<string, string | undefined>> = {
  SUPABASE_URL: import.meta.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
};

/**
 * `process.env` primero: es lo que existe en runtime dentro de una función
 * serverless de Vercel. `import.meta.env` es el fallback para `astro dev`.
 */
function readEnv(name: string): string | undefined {
  const fromProcess = typeof process === "undefined" ? undefined : process.env[name];
  if (fromProcess !== undefined && fromProcess !== "") return fromProcess;

  const fromMeta = STATIC_ENV[name];
  return fromMeta !== undefined && fromMeta !== "" ? fromMeta : undefined;
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
