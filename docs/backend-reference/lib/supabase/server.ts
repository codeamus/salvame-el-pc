import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";

/**
 * Cliente de Supabase para usar en páginas/endpoints .astro (SSR), respetando la
 * sesión del usuario logueado (cookies). Usar este para todo lo que dependa de
 * "quién está pidiendo esto" — ej. proteger /admin.
 */
export function createSupabaseServerClient(cookies: AstroCookies, request: Request) {
  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.headers
            .get("cookie")
            ?.split(";")
            .map((c) => {
              const [name, ...rest] = c.trim().split("=");
              return { name, value: rest.join("=") };
            }) ?? [];
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookies.set(name, value, options);
          });
        },
      },
    },
  );
}

/**
 * Cliente "admin" con la service role key: salta RLS por completo.
 * SOLO usar dentro de src/pages/api/** (endpoints server-side), NUNCA en
 * código que pueda terminar en el bundle del browser.
 *
 * Se usa para: descontar stock al confirmar un pago (webhook de MercadoPago),
 * crear pedidos, y cualquier escritura que no deba depender de RLS de un usuario.
 */
export function createSupabaseAdminClient() {
  return createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
}
