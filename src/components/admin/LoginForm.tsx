import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ingreso al panel.
 *
 * Correo y contraseña contra Supabase Auth. El registro público está
 * deshabilitado en el dashboard, así que acá no hay "crear cuenta": los
 * usuarios se dan de alta a mano desde Supabase.
 */

interface Props {
  supabase: SupabaseClient;
}

/**
 * Traduce el error de Supabase a algo accionable.
 *
 * Los mensajes crudos vienen en inglés y son deliberadamente vagos
 * ("Invalid login credentials" no distingue correo inexistente de
 * contraseña mala, y eso está bien: decirlo permitiría averiguar qué
 * correos existen). Pero hay dos casos que SÍ conviene distinguir, porque
 * son errores de configuración y no del usuario, y sin traducirlos uno se
 * queda diez minutos pensando que escribió mal la contraseña.
 */
function mensajeDeError(mensaje: string): string {
  if (/email not confirmed/i.test(mensaje)) {
    return "El usuario existe pero su correo no está confirmado. En Supabase → Authentication → Users, ábrelo y confírmalo.";
  }
  if (/signups? not allowed|disabled/i.test(mensaje)) {
    return "El registro está deshabilitado (así debe ser). El usuario hay que crearlo desde Supabase → Authentication → Users.";
  }
  if (/invalid login credentials/i.test(mensaje)) {
    return "Correo o contraseña incorrectos.";
  }
  if (/failed to fetch|network/i.test(mensaje)) {
    return "No se pudo conectar con Supabase. Revisa tu conexión y que el proyecto esté activo.";
  }
  return mensaje;
}

export default function LoginForm({ supabase }: Props) {
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setEnviando(true);
    setError(null);

    const { error: fallo } = await supabase.auth.signInWithPassword({
      email: correo.trim().toLowerCase(),
      password,
    });

    // Si fue bien, no se hace nada más: onAuthStateChange en AdminApp recibe
    // la sesión y cambia la pantalla. Manejarlo también acá sería tener dos
    // fuentes de verdad para lo mismo.
    if (fallo !== null) {
      setError(mensajeDeError(fallo.message));
      setPassword("");
    }

    setEnviando(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <p className="eyebrow">Sálvame el PC</p>
        <h1 className="mt-3 mb-8 text-[40px] leading-none font-extrabold tracking-[-.04em] uppercase">
          Panel<span className="text-coral">.</span>
        </h1>

        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
          <label className="sr-only" htmlFor="admin-correo">
            Correo electrónico
          </label>
          <input
            id="admin-correo"
            type="email"
            name="email"
            required
            autoComplete="username"
            placeholder="Correo electrónico"
            className="field"
            value={correo}
            onChange={(event) => setCorreo(event.target.value)}
          />

          <label className="sr-only" htmlFor="admin-password">
            Contraseña
          </label>
          <input
            id="admin-password"
            type="password"
            name="password"
            required
            autoComplete="current-password"
            placeholder="Contraseña"
            className="field"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error !== null && (
            // role="alert" para que un lector de pantalla lo anuncie al
            // aparecer: si no, alguien navegando con teclado reintenta a
            // ciegas sin enterarse de que hubo un error.
            <p role="alert" className="border border-coral px-4 py-3 text-[13px] text-coral">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary mt-2" disabled={enviando}>
            {enviando ? "Entrando…" : "Entrar →"}
          </button>
        </form>

        <p className="mt-8 font-mono text-[11px] text-muted">
          Acceso restringido. Los intentos quedan registrados en Supabase.
        </p>
      </div>
    </main>
  );
}
