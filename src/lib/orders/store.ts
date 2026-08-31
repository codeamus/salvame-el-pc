import type { Quote } from "./quote";
import type { CheckoutPayload } from "@/lib/checkout-form";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * STORE DE ÓRDENES — ⚠️ EN MEMORIA, SOLO PARA DESARROLLO
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Esto NO es una fuente de verdad y no puede salir a producción así.
 *
 * En Vercel cada invocación puede correr en una instancia distinta y el
 * proceso se recicla entre requests. En la práctica: el callback de TUU
 * puede llegar a una instancia que nunca vio esta orden, y la página de
 * éxito puede preguntar por ella a una tercera. En local, con un túnel, el
 * proceso es uno solo y el flujo completo funciona de punta a punta.
 *
 * Todo el resto del código habla con estas cuatro funciones y con nadie más.
 * Cuando exista base de datos se reescriben acá —mismo contrato— y no hay
 * que tocar el endpoint de checkout, ni el callback, ni la página de éxito.
 *
 * Ver docs/pagos-tuu.md § "Antes de producción" para el detalle de qué hace
 * falta (índice único sobre reference, expiración de pendientes, registro de
 * cada intento de callback para conciliar con TUU).
 */

export type OrderStatus = "pending" | "completed" | "failed";

export interface OrderRecord {
  readonly reference: string;
  /** Monto en CLP calculado en el servidor. Es contra esto que se valida el callback. */
  readonly amountCLP: number;
  readonly status: OrderStatus;
  readonly quote: Quote;
  /** Datos del comprador, incluidos los que TUU no recibe (RUT, dirección). */
  readonly customer: CheckoutPayload;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Último callback recibido, crudo. Es lo que se usa para conciliar. */
  readonly lastNotification?: Record<string, string>;
}

const memory = new Map<string, OrderRecord>();

export function saveOrder(order: OrderRecord): Promise<void> {
  memory.set(order.reference, order);
  return Promise.resolve();
}

export function getOrder(reference: string): Promise<OrderRecord | undefined> {
  return Promise.resolve(memory.get(reference));
}

/**
 * Marca el resultado del pago. Idempotente a propósito.
 *
 * TUU reintenta el callback hasta 10 veces con backoff exponencial, así que
 * la misma notificación va a llegar más de una vez. Una orden que ya está en
 * estado final no se vuelve a tocar: sin esto, un reintento tardío podría
 * pisar un "completed" o disparar dos veces el envío del pedido.
 */
export function markOrderResult(
  reference: string,
  status: Exclude<OrderStatus, "pending">,
  notification: Record<string, string>,
): Promise<{ changed: boolean }> {
  const order = memory.get(reference);
  if (order === undefined) return Promise.resolve({ changed: false });
  if (order.status !== "pending") return Promise.resolve({ changed: false });

  memory.set(reference, {
    ...order,
    status,
    lastNotification: notification,
    updatedAt: new Date().toISOString(),
  });

  return Promise.resolve({ changed: true });
}

/**
 * Referencia única de la orden: ORD-20260831-A1B2C3D4.
 *
 * Lleva la fecha por delante para que sea legible al conciliar contra el
 * panel de TUU, y un tramo aleatorio para que dos compras simultáneas no
 * colisionen. Es la clave con la que se casa el callback, así que repetirla
 * significaría marcar la orden equivocada como pagada.
 */
export function newOrderReference(now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

  return `ORD-${day}-${random}`;
}
