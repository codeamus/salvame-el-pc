import type { SupabaseBrowserConfig } from "./browser";

/**
 * Configuración pública de Supabase, leída en el SERVIDOR.
 *
 * Vive separada de server.ts a propósito: ese módulo tiene la service role
 * key y la regla es que no lo toque nada fuera de src/pages/api/**. Este, en
 * cambio, lo importa la página del panel para pasarle la configuración al
 * componente de React. Mezclarlos sería poner la llave maestra a un import
 * de distancia del navegador.
 *
 * Lo que devuelve termina serializado en el HTML de /admin. Eso está bien:
 * la clave pública está DISEÑADA para viajar al cliente, y lo único que
 * protege los datos con ella es el RLS de supabase/schema.sql.
 */

/**
 * Acceso ESTÁTICO a import.meta.env, una variable por línea.
 *
 * Vite reemplaza la expresión literal en tiempo de build; un acceso dinámico
 * no se reemplaza nunca y devuelve undefined para toda variable sin prefijo
 * PUBLIC_. Mismo patrón que src/lib/tuu/env.ts y src/lib/supabase/server.ts.
 */
const STATIC_ENV: Readonly<Record<string, string | undefined>> = {
  SUPABASE_URL: import.meta.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: import.meta.env.SUPABASE_ANON_KEY,
};

function required(name: string): string {
  const fromProcess = typeof process === "undefined" ? undefined : process.env[name];
  if (fromProcess !== undefined && fromProcess !== "") return fromProcess;

  const fromMeta = STATIC_ENV[name];
  if (fromMeta !== undefined && fromMeta !== "") return fromMeta;

  throw new Error(
    `[supabase] Falta la variable de entorno ${name}. ` +
      `Sin ella el panel de administración no puede autenticar a nadie. ` +
      `Revisa .env en local o el environment del deploy en Vercel.`,
  );
}

export function getSupabaseBrowserConfig(): SupabaseBrowserConfig {
  return {
    url: required("SUPABASE_URL"),
    anonKey: required("SUPABASE_ANON_KEY"),
  };
}
