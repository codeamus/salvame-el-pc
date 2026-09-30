import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCLP } from "@/lib/format";

/**
 * Resumen del panel.
 *
 * Es la primera pantalla después de entrar, así que responde lo que uno
 * quiere saber al abrir la tienda por la mañana: qué pedidos hay que
 * atender, si algo necesita revisión y cuánto se vendió.
 *
 * Todas las consultas van con la sesión del admin y son de solo lectura. Si
 * el RLS estuviera mal, esta pantalla se vería vacía en vez de mostrar datos
 * ajenos: no hay forma de que muestre algo que la base no autorizó.
 */

interface Props {
  supabase: SupabaseClient;
}

interface Resumen {
  productos: number;
  publicados: number;
  pedidosNuevos: number;
  pedidosPorRevisar: number;
  vendidoCLP: number;
  ultimos: { reference: string; amount_clp: number; status: string; created_at: string }[];
}

export default function Dashboard({ supabase }: Props) {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;

    async function cargar(): Promise<void> {
      try {
        /*
         * `head: true` pide solo el conteo, sin traerse las filas. Para
         * contar 12 productos da igual, pero el día que haya 3.000 pedidos
         * esta pantalla seguiría abriendo igual de rápido.
         */
        const [productos, publicados, nuevos, porRevisar, pagados, ultimos] = await Promise.all([
          supabase.from("products").select("*", { count: "exact", head: true }),
          supabase
            .from("products")
            .select("*", { count: "exact", head: true })
            .eq("is_published", true),
          supabase
            .from("orders")
            .select("*", { count: "exact", head: true })
            .eq("status", "completed")
            .eq("fulfillment_status", "nuevo"),
          supabase
            .from("orders")
            .select("*", { count: "exact", head: true })
            .eq("needs_review", true),
          supabase.from("orders").select("amount_clp").eq("status", "completed"),
          supabase
            .from("orders")
            .select("reference, amount_clp, status, created_at")
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        const fallo =
          productos.error ?? nuevos.error ?? pagados.error ?? ultimos.error ?? porRevisar.error;
        if (fallo !== null && fallo !== undefined) throw new Error(fallo.message);

        const vendido = (pagados.data ?? []).reduce<number>(
          (total, fila) => total + Number(fila.amount_clp),
          0,
        );

        if (!vigente) return;
        setResumen({
          productos: productos.count ?? 0,
          publicados: publicados.count ?? 0,
          pedidosNuevos: nuevos.count ?? 0,
          pedidosPorRevisar: porRevisar.count ?? 0,
          vendidoCLP: vendido,
          ultimos: ultimos.data ?? [],
        });
      } catch (fallo) {
        if (vigente) setError(fallo instanceof Error ? fallo.message : String(fallo));
      }
    }

    void cargar();
    return () => {
      vigente = false;
    };
  }, [supabase]);

  if (error !== null) {
    return (
      <div className="px-6 py-16 sm:px-10">
        <p className="eyebrow">Resumen</p>
        <p role="alert" className="mt-4 border border-coral px-4 py-3 text-[13px] text-coral">
          No se pudieron cargar los datos: {error}
        </p>
      </div>
    );
  }

  if (resumen === null) {
    return (
      <div className="px-6 py-16 sm:px-10">
        <p className="font-mono text-[13px] text-muted">[ cargando… ]</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-10 sm:px-10">
      <p className="eyebrow">Resumen</p>
      <h1 className="mt-3 mb-9 text-[40px] leading-none font-extrabold tracking-[-.04em] uppercase">
        Hoy<span className="text-coral">.</span>
      </h1>

      <div className="grid grid-cols-1 gap-px border border-line bg-line-soft sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta
          titulo="Pedidos por preparar"
          valor={String(resumen.pedidosNuevos)}
          nota="pagados y sin despachar"
          destacar={resumen.pedidosNuevos > 0}
        />
        <Tarjeta
          titulo="Necesitan revisión"
          valor={String(resumen.pedidosPorRevisar)}
          nota="se pagaron sin stock suficiente"
          alerta={resumen.pedidosPorRevisar > 0}
        />
        <Tarjeta
          titulo="Productos"
          valor={String(resumen.productos)}
          nota={`${resumen.publicados} publicados`}
        />
        <Tarjeta titulo="Vendido" valor={formatCLP(resumen.vendidoCLP)} nota="pagos confirmados" />
      </div>

      <h2 className="mt-12 mb-4 text-lg font-extrabold tracking-[-.02em] uppercase">
        Últimos pedidos
      </h2>

      {resumen.ultimos.length === 0 ? (
        <p className="border border-line px-5 py-8 text-center text-[15px] text-muted">
          Todavía no hay pedidos.
        </p>
      ) : (
        <div className="overflow-x-auto border border-line">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-4 py-3 font-mono text-[11px] tracking-[.14em] uppercase">
                  Referencia
                </th>
                <th className="px-4 py-3 font-mono text-[11px] tracking-[.14em] uppercase">
                  Estado
                </th>
                <th className="px-4 py-3 text-right font-mono text-[11px] tracking-[.14em] uppercase">
                  Monto
                </th>
                <th className="px-4 py-3 font-mono text-[11px] tracking-[.14em] uppercase">
                  Fecha
                </th>
              </tr>
            </thead>
            <tbody>
              {resumen.ultimos.map((pedido) => (
                <tr key={pedido.reference} className="border-b border-line-soft last:border-b-0">
                  <td className="px-4 py-3 font-mono text-[12px]">{pedido.reference}</td>
                  <td className="px-4 py-3">
                    <EstadoPago status={pedido.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{formatCLP(pedido.amount_clp)}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-muted">
                    {new Date(pedido.created_at).toLocaleString("es-CL", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tarjeta({
  titulo,
  valor,
  nota,
  destacar = false,
  alerta = false,
}: {
  titulo: string;
  valor: string;
  nota: string;
  destacar?: boolean;
  alerta?: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-col gap-1.5 px-5 py-6",
        alerta ? "bg-coral text-on-coral" : destacar ? "bg-invert text-on-invert" : "bg-cream",
      ].join(" ")}
    >
      <p className="font-mono text-[11px] tracking-[.14em] uppercase opacity-70">{titulo}</p>
      <p className="text-3xl font-extrabold tracking-[-.03em]">{valor}</p>
      <p className="text-[12px] opacity-60">{nota}</p>
    </div>
  );
}

/** El estado del PAGO, que lo escribe el callback de TUU. */
function EstadoPago({ status }: { status: string }) {
  const etiquetas: Record<string, string> = {
    pending: "pendiente",
    completed: "pagado",
    failed: "rechazado",
  };

  return (
    <span
      className={[
        "border px-2 py-0.5 font-mono text-[11px]",
        status === "completed"
          ? "border-line bg-ink text-cream"
          : status === "failed"
            ? "border-coral text-coral"
            : "border-line-soft text-muted",
      ].join(" ")}
    >
      {etiquetas[status] ?? status}
    </span>
  );
}
