import { defineMiddleware } from "astro:middleware";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Protege todo lo que cuelga de /admin. Si no hay sesión, redirige a /admin/login.
 * Nota: por ahora cualquier usuario autenticado en Supabase Auth cuenta como
 * "admin" (pensado para dueño único de la tienda). Si en el futuro hay varios
 * usuarios con roles distintos, acá es donde hay que sumar una tabla `admins`
 * y validar el email contra ella.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, request, redirect } = context;

  if (!url.pathname.startsWith("/admin")) {
    return next();
  }

  const supabase = createSupabaseServerClient(cookies, request);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  context.locals.session = session;

  const isLoginPage = url.pathname === "/admin/login";

  if (!session && !isLoginPage) {
    return redirect("/admin/login");
  }

  if (session && isLoginPage) {
    return redirect("/admin");
  }

  return next();
});
