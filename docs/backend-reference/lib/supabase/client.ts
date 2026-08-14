import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para usar EN EL BROWSER (islands de React, ej. login de admin).
 * Usa la anon key: solo puede hacer lo que las políticas RLS de la base le permitan.
 * Nunca importar la service role key acá.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  );
}
