import { useCallback, useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import AdminShell from "./AdminShell";
import Dashboard from "./Dashboard";
import LoginForm from "./LoginForm";
import { getSupabaseBrowser, type SupabaseBrowserConfig } from "@/lib/supabase/browser";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * RAÍZ DEL PANEL — sesión y navegación
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Dos responsabilidades y nada más: saber si hay sesión, y saber en qué
 * sección estamos. Todo lo demás lo hacen los componentes de cada sección,
 * que reciben el cliente ya autenticado.
 *
 * Recordatorio de seguridad, porque este archivo invita a olvidarlo: que acá
 * se muestre el login cuando no hay sesión es COMODIDAD, no protección. La
 * defensa real es el RLS de supabase/schema.sql — sin sesión válida, la base
 * no devuelve un pedido ni acepta una escritura, por más que alguien fuerce
 * el render del dashboard desde las devtools.
 */

interface Props {
  config: SupabaseBrowserConfig;
  rutaInicial: string;
}

/** Secciones del panel. El orden es el del menú. */
export const SECCIONES = [
  { ruta: "/admin", etiqueta: "Resumen" },
  { ruta: "/admin/productos", etiqueta: "Productos" },
  { ruta: "/admin/contenido", etiqueta: "Contenido" },
  { ruta: "/admin/legales", etiqueta: "Legales" },
  { ruta: "/admin/pedidos", etiqueta: "Pedidos" },
  { ruta: "/admin/ajustes", etiqueta: "Ajustes" },
] as const;

export default function AdminApp({ config, rutaInicial }: Props) {
  const [supabase] = useState<SupabaseClient>(() => getSupabaseBrowser(config));

  /*
   * `undefined` = todavía no sabemos; `null` = sin sesión.
   *
   * La distinción importa: leer la sesión del localStorage es asíncrono, y
   * tratar "todavía no sé" como "no hay sesión" haría parpadear el login en
   * la cara de alguien que sí está conectado, cada vez que abre el panel.
   */
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined);
  const [ruta, setRuta] = useState(rutaInicial);

  useEffect(() => {
    let vigente = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (vigente) setSesion(data.session);
    });

    /*
     * Escucha los cambios posteriores: login, logout, y el refresco
     * automático del token. También cubre el caso de dos pestañas abiertas —
     * cerrar sesión en una deja a la otra mostrando un panel que ya no
     * puede leer nada.
     */
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSesion(nueva);
    });

    return () => {
      vigente = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  /*
   * Navegación sin recargar.
   *
   * La URL se mantiene sincronizada con pushState para que el botón atrás,
   * recargar y compartir un enlace funcionen. La página de Astro es
   * atrapa-todo, así que cualquiera de esas rutas resuelve del lado servidor
   * también.
   */
  const navegar = useCallback((destino: string) => {
    window.history.pushState({}, "", destino);
    setRuta(destino);
  }, []);

  useEffect(() => {
    const alVolver = (): void => setRuta(window.location.pathname);
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, []);

  if (sesion === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="font-mono text-[13px] text-muted">[ cargando panel… ]</p>
      </main>
    );
  }

  if (sesion === null) {
    return <LoginForm supabase={supabase} />;
  }

  return (
    <AdminShell supabase={supabase} sesion={sesion} ruta={ruta} navegar={navegar}>
      {renderSeccion(ruta, supabase)}
    </AdminShell>
  );
}

function renderSeccion(ruta: string, supabase: SupabaseClient) {
  switch (ruta) {
    case "/admin":
      return <Dashboard supabase={supabase} />;
    default:
      return <EnConstruccion ruta={ruta} />;
  }
}

/**
 * Marcador explícito de lo que todavía no existe.
 *
 * Preferible a una pantalla en blanco o a un enlace que no lleva a ninguna
 * parte: deja claro que la sección está planificada y no rota.
 */
function EnConstruccion({ ruta }: { ruta: string }) {
  const seccion = SECCIONES.find((s) => s.ruta === ruta);

  return (
    <div className="px-6 py-16 sm:px-10">
      <p className="eyebrow">{seccion?.etiqueta ?? "Sección"}</p>
      <h1 className="mt-3 text-[40px] leading-none font-extrabold tracking-[-.04em] uppercase">
        En construcción<span className="text-coral">.</span>
      </h1>
      <p className="mt-4 max-w-[50ch] text-[15px] text-ink/70">
        Esta sección todavía no está implementada. La base de datos ya la soporta.
      </p>
    </div>
  );
}
