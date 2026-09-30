/**
 * ─────────────────────────────────────────────────────────────────────────
 * PEDIDOS — lectura para el panel
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un pedido tiene DOS estados y confundirlos es el error caro:
 *
 *   status              el del PAGO. Lo escribe el callback firmado de TUU.
 *                       El panel no lo toca nunca: es plata, y cambiarlo a
 *                       mano sería declarar cobrado algo que no se cobró.
 *   fulfillment_status  el de la LOGÍSTICA. Lo escribe el admin. Es lo único
 *                       que esta pantalla modifica.
 *
 * La separación está en el schema por el mismo motivo: si fueran una sola
 * columna, marcar "enviado" sacaría la orden de 'completed' y el siguiente
 * reintento del callback —TUU manda hasta 10— la reprocesaría como si
 * recién se hubiera pagado.
 */

export type EstadoPago = "pending" | "completed" | "failed";

export type EstadoEntrega =
  "nuevo" | "preparando" | "enviado" | "entregado" | "retirado" | "cancelado";

export const ESTADOS_ENTREGA: readonly { valor: EstadoEntrega; etiqueta: string }[] = [
  { valor: "nuevo", etiqueta: "Nuevo" },
  { valor: "preparando", etiqueta: "Preparando" },
  { valor: "enviado", etiqueta: "Enviado" },
  { valor: "entregado", etiqueta: "Entregado" },
  { valor: "retirado", etiqueta: "Retirado" },
  { valor: "cancelado", etiqueta: "Cancelado" },
];

export const ETIQUETAS_PAGO: Readonly<Record<EstadoPago, string>> = {
  pending: "pendiente",
  completed: "pagado",
  failed: "rechazado",
};

export interface LineaPedido {
  readonly slug: string;
  readonly name: string;
  readonly quantity: number;
  readonly unit_price_clp: number;
  readonly line_total_clp: number;
}

export interface PedidoAdmin {
  readonly id: string;
  readonly reference: string;
  readonly status: EstadoPago;
  readonly fulfillment_status: EstadoEntrega;
  readonly amount_clp: number;
  readonly customer: Record<string, unknown>;
  readonly quote: Record<string, unknown>;
  readonly last_notification: Record<string, string> | null;
  readonly tuu_payment_id: string | null;
  readonly admin_notes: string | null;
  readonly needs_review: boolean;
  readonly created_at: string;
  readonly order_items: readonly LineaPedido[];
}

export const COLUMNAS_PEDIDO =
  "id, reference, status, fulfillment_status, amount_clp, customer, quote, last_notification, tuu_payment_id, admin_notes, needs_review, created_at, order_items(slug, name, quantity, unit_price_clp, line_total_clp)";

/** Datos del comprador, tolerando que el jsonb venga incompleto. */
export interface Comprador {
  readonly nombre: string;
  readonly rut: string;
  readonly correo: string;
  readonly telefono: string;
  readonly entrega: string;
  readonly direccion: string | null;
}

/**
 * Acepta `unknown` y no un Record con forma, a propósito.
 *
 * El valor viene de una columna jsonb: lo escribió una versión del
 * formulario que pudo cambiar, y puede ser cualquier cosa. Tiparlo como si
 * tuviera garantías sería una promesa que la base no hace — y obligaría a
 * castear en cada punto de uso, que es la forma de que un `as` termine
 * mintiendo.
 */
export function leerComprador(customer: unknown): Comprador {
  const datos: Record<string, unknown> =
    typeof customer === "object" && customer !== null ? (customer as Record<string, unknown>) : {};

  const txt = (clave: string): string => (typeof datos[clave] === "string" ? datos[clave] : "");

  const dir = datos.direccion;
  let direccion: string | null = null;

  if (typeof dir === "object" && dir !== null) {
    const d = dir as Record<string, unknown>;
    const partes = [d.calle, d.comuna, d.region, d.referencia]
      .filter((x): x is string => typeof x === "string" && x.trim() !== "")
      .map((x) => x.trim());
    direccion = partes.length > 0 ? partes.join(", ") : null;
  }

  return {
    nombre: txt("nombre"),
    rut: txt("rut"),
    correo: txt("correo"),
    telefono: txt("telefono"),
    // "acordar" significa que no hay dirección y eso no es un dato faltante:
    // es la forma de entrega que eligió el comprador.
    entrega: txt("entrega") === "acordar" ? "Coordinar entrega" : "Despacho a domicilio",
    direccion,
  };
}

/**
 * ¿Este pedido necesita atención?
 *
 * Un pedido pagado que sigue en "nuevo" es trabajo por hacer. Uno con
 * needs_review se cobró sin stock suficiente y hay que resolverlo a mano —
 * la plata ya entró, así que no se puede simplemente ignorar.
 */
export function requiereAtencion(pedido: PedidoAdmin): boolean {
  if (pedido.needs_review) return true;
  return pedido.status === "completed" && pedido.fulfillment_status === "nuevo";
}

/**
 * Un pedido que nunca recibió confirmación y ya lleva rato.
 *
 * TUU tarda minutos, no horas. Uno que sigue pendiente al día siguiente o
 * no se pagó, o su callback se perdió: en los dos casos hay que conciliar
 * contra el panel de TUU antes de darlo por perdido.
 */
export function esPendienteAntiguo(pedido: PedidoAdmin, ahora = Date.now()): boolean {
  if (pedido.status !== "pending") return false;
  const horas = (ahora - new Date(pedido.created_at).getTime()) / 3_600_000;
  return horas >= 24;
}

export function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function mensajeDeErrorPedido(mensaje: string): string {
  if (/row-level security|permission denied/i.test(mensaje)) {
    return "Tu sesión no tiene permiso para esto. Vuelve a entrar.";
  }
  if (/invalid input value for enum/i.test(mensaje)) {
    return "Ese estado de entrega no existe.";
  }
  return mensaje;
}
