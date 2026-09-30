import type { ReactNode } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useStore } from "@nanostores/react";
import { SECCIONES } from "./AdminApp";
import { $publicacion, publicar } from "@/lib/admin/publicar";

/**
 * Estructura del panel: barra lateral, sesión y contenido.
 *
 * Es puramente presentacional — no consulta nada ni decide nada. Recibe en
 * qué ruta estamos y cómo navegar, y dibuja el marco alrededor.
 */

interface Props {
  supabase: SupabaseClient;
  sesion: Session;
  ruta: string;
  navegar: (destino: string) => void;
  children: ReactNode;
}

export default function AdminShell({ supabase, sesion, ruta, navegar, children }: Props) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex flex-col border-line lg:w-60 lg:shrink-0 lg:border-r">
        <div className="border-b border-line px-6 py-5">
          <p className="eyebrow">Sálvame el PC</p>
          <p className="mt-1 text-xl font-extrabold tracking-[-.03em]">
            Panel<span className="text-coral">.</span>
          </p>
        </div>

        <nav aria-label="Secciones del panel" className="flex flex-col border-b border-line">
          {SECCIONES.map((seccion) => {
            /*
             * "Productos" tiene que seguir marcado en /admin/productos/nuevo
             * y en /admin/productos/7. Por eso no basta la igualdad exacta.
             *
             * "/admin" se compara aparte porque es prefijo de TODAS las demás
             * rutas: con la regla general quedaría siempre activo y el menú
             * mostraría dos secciones marcadas a la vez.
             */
            const activa =
              seccion.ruta === "/admin"
                ? ruta === "/admin"
                : ruta === seccion.ruta || ruta.startsWith(`${seccion.ruta}/`);
            return (
              <a
                key={seccion.ruta}
                href={seccion.ruta}
                // El href real se conserva para que el enlace se pueda abrir
                // en otra pestaña o copiar; el preventDefault solo evita la
                // recarga cuando se hace clic normal.
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                  event.preventDefault();
                  navegar(seccion.ruta);
                }}
                aria-current={activa ? "page" : undefined}
                className={[
                  "border-b border-line-soft px-6 py-3.5 text-sm font-bold no-underline transition-colors",
                  activa ? "bg-ink text-cream" : "text-ink hover:bg-coral hover:text-on-coral",
                ].join(" ")}
              >
                {seccion.etiqueta}
              </a>
            );
          })}
        </nav>

        <div className="mt-auto px-6 py-5">
          <IndicadorPublicacion supabase={supabase} />

          <p className="font-mono text-[11px] break-all text-muted">{sesion.user.email}</p>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="mt-3 cursor-pointer border-none bg-transparent p-0 font-mono text-[11px] text-coral underline"
          >
            cerrar sesión
          </button>
          <p className="mt-4 font-mono text-[11px] text-faint">
            <a href="/" className="text-faint underline">
              ver la tienda ↗
            </a>
          </p>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

/**
 * Qué está pasando con el sitio público.
 *
 * La publicación es automática, así que esto no es un botón sino un estado.
 * El botón solo aparece cuando algo falló: es el único momento en que hay
 * una decisión que tomar.
 */
function IndicadorPublicacion({ supabase }: { supabase: SupabaseClient }) {
  const estado = useStore($publicacion);

  if (estado.fase === "inactivo") return null;

  return (
    <div aria-live="polite" className="mb-4 border-t border-line-soft pt-4">
      {estado.fase === "publicando" && (
        <p className="font-mono text-[11px] text-muted">[ publicando en el sitio… ]</p>
      )}

      {estado.fase === "publicado" && (
        <p className="font-mono text-[11px] text-muted">
          sitio actualizado ✓{" "}
          <span className="text-faint">
            {new Date(estado.cuando).toLocaleTimeString("es-CL", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </p>
      )}

      {estado.fase === "aviso" && (
        <div>
          <p className="text-[11px] leading-relaxed text-coral">{estado.mensaje}</p>
          <button
            type="button"
            onClick={() => void publicar(supabase)}
            className="mt-2 cursor-pointer border-none bg-transparent p-0 font-mono text-[11px] underline"
          >
            reintentar
          </button>
        </div>
      )}
    </div>
  );
}
