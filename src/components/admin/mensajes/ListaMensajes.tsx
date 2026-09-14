import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatearFecha } from "@/lib/admin/pedidos";

/**
 * Mensajes del formulario de contacto.
 *
 * Existen en la base además de enviarse por correo, y ese "además" es el
 * punto: un aviso que cae en spam o que alguien borra sin querer dejaría de
 * ser un cliente perdido sin rastro.
 *
 * Por eso la pantalla destaca los que NO se alcanzaron a avisar: son
 * justamente los que nadie vio llegar.
 */

interface Props {
  supabase: SupabaseClient;
}

interface Mensaje {
  id: string;
  nombre: string;
  correo: string;
  asunto: string;
  mensaje: string;
  leido: boolean;
  aviso_enviado_at: string | null;
  created_at: string;
}

export default function ListaMensajes({ supabase }: Props) {
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    const { data, error: fallo } = await supabase
      .from("contact_messages")
      .select("id, nombre, correo, asunto, mensaje, leido, aviso_enviado_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<Mensaje[]>();

    if (fallo !== null) setError(fallo.message);
    else {
      setMensajes(data);
      setError(null);
    }
  }, [supabase]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function abrir(mensaje: Mensaje): Promise<void> {
    const cerrando = abierto === mensaje.id;
    setAbierto(cerrando ? null : mensaje.id);

    // Se marca leído al abrirlo: es lo que uno espera de una bandeja, y
    // evita tener que acordarse de un botón aparte.
    if (!cerrando && !mensaje.leido) {
      await supabase.from("contact_messages").update({ leido: true }).eq("id", mensaje.id);
      await cargar();
    }
  }

  if (mensajes === null) {
    return (
      <p className="px-6 py-16 font-mono text-[13px] text-muted sm:px-10">
        {error ?? "[ cargando… ]"}
      </p>
    );
  }

  const sinLeer = mensajes.filter((m) => !m.leido).length;
  const sinAvisar = mensajes.filter((m) => m.aviso_enviado_at === null).length;

  return (
    <div className="px-6 py-10 sm:px-10">
      <p className="eyebrow">Tienda</p>
      <h1 className="mt-3 text-[40px] leading-none font-extrabold tracking-[-.04em] uppercase">
        Mensajes<span className="text-coral">.</span>
      </h1>
      <p className="mt-4 max-w-[62ch] text-[15px] text-ink/70">
        Lo que llega por el formulario de contacto. {sinLeer} sin leer de {mensajes.length}.
      </p>

      {sinAvisar > 0 && (
        <div className="mt-6 border border-coral px-5 py-4">
          <p className="text-[13px] font-bold text-coral">
            {sinAvisar} mensaje{sinAvisar === 1 ? "" : "s"} sin aviso por correo
          </p>
          <p className="mt-1.5 max-w-[70ch] text-[13px] text-ink/75">
            Llegaron bien y están acá, pero el correo de aviso no salió. Suele ser que falta
            configurar el correo de contacto en Ajustes → Datos legales, o las credenciales de envío
            en el deploy.
          </p>
        </div>
      )}

      {error !== null && (
        <p role="alert" className="mt-6 border border-coral px-4 py-3 text-[13px] text-coral">
          {error}
        </p>
      )}

      {mensajes.length === 0 ? (
        <p className="mt-8 border border-line px-5 py-10 text-center text-[15px] text-muted">
          Todavía no llega ningún mensaje.
        </p>
      ) : (
        <div className="mt-7 flex flex-col gap-3">
          {mensajes.map((mensaje) => (
            <article
              key={mensaje.id}
              className={["border", mensaje.leido ? "border-line-soft" : "border-line"].join(" ")}
            >
              <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <button
                  type="button"
                  onClick={() => void abrir(mensaje)}
                  aria-expanded={abierto === mensaje.id}
                  className={[
                    "cursor-pointer border-none bg-transparent p-0 text-left text-sm",
                    mensaje.leido ? "font-medium" : "font-extrabold",
                  ].join(" ")}
                >
                  {mensaje.asunto === "" ? "Consulta" : mensaje.asunto}
                </button>

                <span className="text-[13px] text-muted">{mensaje.nombre}</span>

                {!mensaje.leido && (
                  <span className="border border-line bg-ink px-2 py-0.5 font-mono text-[11px] text-cream">
                    nuevo
                  </span>
                )}

                {mensaje.aviso_enviado_at === null && (
                  <span
                    title="Llegó, pero el aviso por correo no salió"
                    className="border border-coral px-2 py-0.5 font-mono text-[11px] text-coral"
                  >
                    sin avisar
                  </span>
                )}

                <span className="ml-auto font-mono text-[11px] text-muted">
                  {formatearFecha(mensaje.created_at)}
                </span>
              </header>

              {abierto === mensaje.id && (
                <div className="border-t border-line-soft px-5 py-5">
                  <p className="mb-4 text-[13px]">
                    <a href={`mailto:${mensaje.correo}`} className="font-bold underline">
                      {mensaje.correo}
                    </a>
                  </p>
                  {/* whitespace-pre-wrap: los saltos de línea que escribió la
                      persona son parte del mensaje. */}
                  <p className="border-l-2 border-coral bg-stripe/40 px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap">
                    {mensaje.mensaje}
                  </p>
                  <a
                    href={`mailto:${mensaje.correo}?subject=${encodeURIComponent(
                      `Re: ${mensaje.asunto === "" ? "tu consulta" : mensaje.asunto}`,
                    )}`}
                    className="btn-secondary mt-5 inline-flex py-2.5 text-[13px]"
                  >
                    Responder →
                  </a>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
