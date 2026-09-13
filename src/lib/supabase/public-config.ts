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

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `[supabase] Falta la variable de entorno ${name}. ` +
        `Sin ella el panel de administración no puede autenticar a nadie. ` +
        `Revisa .env en local o el environment del deploy en Vercel.`,
    );
  }
  return value;
}

export function getSupabaseBrowserConfig(): SupabaseBrowserConfig {
  return {
    url: required("SUPABASE_URL"),
    anonKey: required("SUPABASE_ANON_KEY"),
  };
}
