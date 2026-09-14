import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COLUMNAS_PEDIDO,
  ESTADOS_ENTREGA,
  ETIQUETAS_PAGO,
  esPendienteAntiguo,
  formatearFecha,
  leerComprador,
  mensajeDeErrorPedido,
  requiereAtencion,
  type EstadoEntrega,
  type PedidoAdmin,
} from "@/lib/admin/pedidos";
import { formatCLP } from "@/lib/format";

/**
 * Pedidos.
 *
 * Lo único que esta pantalla escribe es el estado de ENTREGA y las notas.
 * El estado del PAGO lo escribe el callback firmado de TUU y acá solo se
 * muestra: cambiarlo a mano sería declarar cobrado algo que no se cobró.
 *
 * Ordenados por fecha descendente y con el filtro "por atender" por defecto,
 * porque abrir la tienda por la mañana es abrir esta pantalla y ver qué hay
 * que preparar.
 */

interface Props {
  supabase: SupabaseClient;
}

type Filtro = "atender" | "todos" | "revisar";

export default function ListaPedidos({ supabase }: Props) {
  const [pedidos, setPedidos] = useState<PedidoAdmin[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("atender");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    const { data, error: fallo } = await supabase
      .from("orders")
      .select(COLUMNAS_PEDIDO)
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<PedidoAdmin[]>();

    if (fallo !== null) setError(mensajeDeErrorPedido(fallo.message));
    else {
      setPedidos(data);
      setError(null);
    }
  }, [supabase]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    if (pedidos === null) return [];
    if (filtro === "todos") return pedidos;
    if (filtro === "revisar") return pedidos.filter((p) => p.needs_review);
    return pedidos.filter(requiereAtencion);
  }, [pedidos, filtro]);

  async function actualizar(
    pedido: PedidoAdmin,
    cambios: { fulfillment_status?: EstadoEntrega; admin_notes?: string; needs_review?: boolean },
  ): Promise<void> {
    setOcupado(pedido.id);
    const { error: fallo } = await supabase.from("orders").update(cambios).eq("id", pedido.id);
    setOcupado(null);

    if (fallo !== null) setError(mensajeDeErrorPedido(fallo.message));
    else await cargar();
  }

  if (pedidos === null) {
    return (
      <p className="px-6 py-16 font-mono text-[13px] text-muted sm:px-10">
        {error ?? "[ cargando… ]"}
      </p>
    );
  }

  const porAtender = pedidos.filter(requiereAtencion).length;
  const porRevisar = pedidos.filter((p) => p.needs_review).length;

  return (
    <div className="px-6 py-10 sm:px-10">
      <p className="eyebrow">Tienda</p>
      <h1 className="mt-3 text-[40px] leading-none font-extrabold tracking-[-.04em] uppercase">
        Pedidos<span className="text-coral">.</span>
      </h1>
      <p className="mt-4 max-w-[62ch] text-[15px] text-ink/70">
        El estado del pago lo escribe TUU y no se edita. Acá gestionas la entrega.
      </p>

      {error !== null && (
        <p role="alert" className="mt-6 border border-coral px-4 py-3 text-[13px] text-coral">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-wrap gap-2">
        <Pestana activa={filtro === "atender"} alElegir={() => setFiltro("atender")}>
          Por atender ({porAtender})
        </Pestana>
        <Pestana
          activa={filtro === "revisar"}
          alElegir={() => setFiltro("revisar")}
          alerta={porRevisar > 0}
        >
          Necesitan revisión ({porRevisar})
        </Pestana>
        <Pestana activa={filtro === "todos"} alElegir={() => setFiltro("todos")}>
          Todos ({pedidos.length})
        </Pestana>
      </div>

      {visibles.length === 0 ? (
        <p className="mt-8 border border-line px-5 py-10 text-center text-[15px] text-muted">
          {filtro === "atender"
            ? "Nada pendiente por preparar. "
            : filtro === "revisar"
              ? "Ningún pedido necesita revisión. "
              : "Todavía no hay pedidos."}
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {visibles.map((pedido) => {
            const comprador = leerComprador(pedido.customer);
            const expandido = abierto === pedido.id;

            return (
              <article
                key={pedido.id}
                className={["border", pedido.needs_review ? "border-coral" : "border-line"].join(
                  " ",
                )}
              >
                <header className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3.5">
                  <button
                    type="button"
                    onClick={() => setAbierto(expandido ? null : pedido.id)}
                    aria-expanded={expandido}
                    className="cursor-pointer border-none bg-transparent p-0 text-left font-mono text-[13px] font-bold underline"
                  >
                    {pedido.reference}
                  </button>

                  <span className="text-sm">{comprador.nombre || "—"}</span>

                  <span className="font-mono text-sm">{formatCLP(pedido.amount_clp)}</span>

                  <EtiquetaPago pedido={pedido} />

                  {pedido.needs_review && (
                    <span className="border border-coral bg-coral px-2 py-0.5 font-mono text-[11px] text-on-coral">
                      sin stock al pagar
                    </span>
                  )}

                  <span className="ml-auto font-mono text-[11px] text-muted">
                    {formatearFecha(pedido.created_at)}
                  </span>

                  {/* Solo la logística es editable. El pago no aparece como
                      control en ninguna parte de esta pantalla. */}
                  <label className="flex items-center gap-2">
                    <span className="sr-only">Estado de entrega de {pedido.reference}</span>
                    <select
                      className="field w-40 py-1.5 text-[13px]"
                      value={pedido.fulfillment_status}
                      disabled={ocupado === pedido.id || pedido.status !== "completed"}
                      title={
                        pedido.status !== "completed"
                          ? "El pedido todavía no está pagado"
                          : undefined
                      }
                      onChange={(event) =>
                        void actualizar(pedido, {
                          fulfillment_status: event.target.value as EstadoEntrega,
                        })
                      }
                    >
                      {ESTADOS_ENTREGA.map((estado) => (
                        <option key={estado.valor} value={estado.valor}>
                          {estado.etiqueta}
                        </option>
                      ))}
                    </select>
                  </label>
                </header>

                {expandido && (
                  <div className="grid grid-cols-1 gap-6 border-t border-line-soft px-5 py-5 lg:grid-cols-2">
                    <div>
                      <h3 className="mb-3 font-mono text-[11px] tracking-[.14em] text-muted uppercase">
                        Comprador
                      </h3>
                      <Dato etiqueta="Nombre" valor={comprador.nombre} />
                      <Dato etiqueta="RUT" valor={comprador.rut} />
                      <Dato etiqueta="Correo" valor={comprador.correo} />
                      <Dato etiqueta="Teléfono" valor={comprador.telefono} />
                      <Dato etiqueta="Entrega" valor={comprador.entrega} />
                      <Dato etiqueta="Dirección" valor={comprador.direccion ?? "—"} />
                    </div>

                    <div>
                      <h3 className="mb-3 font-mono text-[11px] tracking-[.14em] text-muted uppercase">
                        Productos
                      </h3>
                      <ul className="flex flex-col gap-1.5 text-[13px]">
                        {pedido.order_items.map((linea) => (
                          <li key={linea.slug} className="flex justify-between gap-4">
                            <span>
                              {linea.quantity}× {linea.name}
                            </span>
                            <span className="font-mono whitespace-nowrap">
                              {formatCLP(linea.line_total_clp)}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {pedido.tuu_payment_id !== null && (
                        <p className="mt-4 font-mono text-[11px] break-all text-muted">
                          {/* Es el id con el que TUU reconoce la transacción
                              en su panel: sin esto, conciliar un pago suelto
                              obliga a leer el jsonb del callback a mano. */}
                          TUU · {pedido.tuu_payment_id}
                        </p>
                      )}
                    </div>

                    <div className="lg:col-span-2">
                      <NotasAdmin
                        pedido={pedido}
                        guardando={ocupado === pedido.id}
                        alGuardar={(notas) => void actualizar(pedido, { admin_notes: notas })}
                      />

                      {pedido.needs_review && (
                        <button
                          type="button"
                          className="btn-secondary mt-4 py-2.5 text-[13px]"
                          disabled={ocupado === pedido.id}
                          onClick={() => void actualizar(pedido, { needs_review: false })}
                        >
                          Marcar revisión como resuelta
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EtiquetaPago({ pedido }: { pedido: PedidoAdmin }) {
  const antiguo = esPendienteAntiguo(pedido);

  return (
    <span
      title={
        antiguo
          ? "Lleva más de un día sin confirmarse. Concilia contra el panel de TUU."
          : undefined
      }
      className={[
        "border px-2 py-0.5 font-mono text-[11px]",
        pedido.status === "completed"
          ? "border-line bg-ink text-cream"
          : pedido.status === "failed"
            ? "border-coral text-coral"
            : antiguo
              ? "border-coral text-coral"
              : "border-line-soft text-muted",
      ].join(" ")}
    >
      {ETIQUETAS_PAGO[pedido.status]}
      {antiguo && " ⚠"}
    </span>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <p className="flex gap-3 py-0.5 text-[13px]">
      <span className="w-20 shrink-0 text-muted">{etiqueta}</span>
      <span className="font-medium break-all">{valor || "—"}</span>
    </p>
  );
}

function NotasAdmin({
  pedido,
  guardando,
  alGuardar,
}: {
  pedido: PedidoAdmin;
  guardando: boolean;
  alGuardar: (notas: string) => void;
}) {
  const [notas, setNotas] = useState(pedido.admin_notes ?? "");
  const sucio = notas !== (pedido.admin_notes ?? "");

  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] tracking-[.14em] text-muted uppercase">
        Notas internas
      </span>
      <textarea
        className="field resize-y text-[13px]"
        rows={2}
        placeholder="Número de seguimiento, acuerdos con el comprador…"
        value={notas}
        onChange={(event) => setNotas(event.target.value)}
      />
      {sucio && (
        <button
          type="button"
          className="btn-secondary self-start py-2 text-[13px]"
          disabled={guardando}
          onClick={() => alGuardar(notas)}
        >
          Guardar nota
        </button>
      )}
    </label>
  );
}

function Pestana({
  activa,
  alerta = false,
  alElegir,
  children,
}: {
  activa: boolean;
  alerta?: boolean;
  alElegir: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={alElegir}
      aria-pressed={activa}
      className={[
        "cursor-pointer border px-4 py-2 text-[13px] font-bold transition-colors",
        activa
          ? "border-line bg-ink text-cream"
          : alerta
            ? "border-coral text-coral"
            : "border-line bg-transparent hover:bg-coral hover:text-on-coral",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
