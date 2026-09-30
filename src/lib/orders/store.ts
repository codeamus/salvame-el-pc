import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { Quote } from "./quote";
import type { CheckoutPayload } from "@/lib/checkout-form";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * STORE DE ÓRDENES — respaldado por Supabase
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Antes esto era un Map en memoria, y era un bug conocido: en Vercel cada
 * invocación puede correr en otra instancia, así que el callback de TUU
 * llegaba a un proceso que nunca había visto la orden y la página de éxito
 * le preguntaba por ella a un tercero. El resultado visible era un pago que
 * sí se cobraba pero que el sitio mostraba como "no encontramos esta orden".
 *
 * Las tres rutas del flujo de pago hablan con estas cuatro funciones y con
 * nadie más, así que migrar de un lado al otro no cambió ni una línea de
 * /api/checkout, /api/tuu/callback ni /api/orders/[reference]. Ese era
 * justamente el punto de que existieran.
 *
 * El esquema y las dos funciones transaccionales están en
 * supabase/schema.sql; la lógica delicada —idempotencia, descuento de stock,
 * bloqueo de fila— vive allá y no acá, porque es la base la que puede
 * garantizarla frente a dos reintentos simultáneos.
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

/** Fila de `orders` tal como la devuelve PostgREST. */
interface OrderRow {
  reference: string;
  amount_clp: number;
  status: OrderStatus;
  quote: Quote;
  customer: CheckoutPayload;
  created_at: string;
  updated_at: string;
  last_notification: Record<string, string> | null;
}

const COLUMNS =
  "reference, amount_clp, status, quote, customer, created_at, updated_at, last_notification";

function toOrderRecord(row: OrderRow): OrderRecord {
  return {
    reference: row.reference,
    amountCLP: row.amount_clp,
    status: row.status,
    quote: row.quote,
    customer: row.customer,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Spread condicional por exactOptionalPropertyTypes: la propiedad no
    // debe existir cuando todavía no llegó ningún callback.
    ...(row.last_notification === null ? {} : { lastNotification: row.last_notification }),
  };
}

/**
 * Crea la orden en estado "pending", junto con sus líneas.
 *
 * `status`, `createdAt` y `updatedAt` del argumento se ignoran: los pone la
 * base. Se reciben igual para no cambiarle la forma a quien llama, y porque
 * la hora que vale es la del servidor de la base y no la de la instancia
 * serverless que atendió el checkout.
 *
 * Las líneas no se mandan aparte: place_order las expande desde el `quote`
 * dentro de la misma transacción, así que es imposible que order_items diga
 * una cosa y el monto firmado otra. Si algo falla, no queda media orden.
 */
export async function saveOrder(order: OrderRecord): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("place_order", {
    p_reference: order.reference,
    p_amount_clp: order.amountCLP,
    p_quote: order.quote,
    p_customer: order.customer,
  });

  if (error !== null) {
    throw new Error(`[orders] no se pudo crear la orden ${order.reference}: ${error.message}`);
  }
}

/** Busca por referencia. `undefined` si no existe — no lanza por eso. */
export async function getOrder(reference: string): Promise<OrderRecord | undefined> {
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .select(COLUMNS)
    .eq("reference", reference)
    .maybeSingle<OrderRow>();

  // Un error acá NO es "no existe": es la base caída o mal configurada. Se
  // propaga para que la ruta responda 5xx y TUU reintente el callback.
  // Devolver undefined haría que una caída se viera igual que una orden
  // inexistente, y el sitio daría por perdido un pago que sí ocurrió.
  if (error !== null) {
    throw new Error(`[orders] no se pudo leer la orden ${reference}: ${error.message}`);
  }

  return data === null ? undefined : toOrderRecord(data);
}

/**
 * Marca el resultado del pago. Idempotente a propósito.
 *
 * TUU reintenta el callback hasta 10 veces con backoff exponencial, así que
 * la misma notificación va a llegar más de una vez. `changed` es false
 * cuando la orden ya estaba cerrada o cuando la referencia no existe: quien
 * llama lo usa para no disparar dos veces el correo al comprador ni la
 * preparación del pedido.
 *
 * Todo el trabajo real —bloquear la fila, revisar que siga pendiente,
 * descontar stock y anotar los movimientos— ocurre dentro de settle_order,
 * en una sola transacción. Hacerlo acá, a punta de select y update
 * separados, dejaría la ventana en la que dos reintentos simultáneos leen
 * "pending" los dos y descuentan el stock dos veces.
 */
export async function markOrderResult(
  reference: string,
  status: Exclude<OrderStatus, "pending">,
  notification: Record<string, string>,
): Promise<{ changed: boolean }> {
  // El cast declara lo que settle_order devuelve (boolean `changed`). Sin
  // tipos generados de la base, supabase-js tipa `data` como any, y `any`
  // silencioso atravesando el flujo de pagos es justo lo que no queremos:
  // acá queda escrito, en un solo lugar y a la vista.
  const { data, error } = (await getSupabaseAdmin().rpc("settle_order", {
    p_reference: reference,
    p_status: status,
    p_notification: notification,
    /*
     * El id de la transacción en TUU.
     *
     * La documentación del proyecto listaba solo x_reference, x_amount,
     * x_result, x_timestamp y x_message —lo que se había observado en la
     * redirección GET—, pero el primer callback POST real trajo bastante
     * más: x_gateway_reference, x_payment_method, x_fee y x_test. El
     * gateway_reference es el identificador con el que TUU reconoce la
     * transacción en su panel, así que es LO que se necesita para conciliar
     * un pago puntual sin ponerse a leer jsonb a mano.
     *
     * El `?? null` no es defensivo por costumbre: el campo no está
     * documentado por TUU, así que no se puede asumir que venga siempre.
     */
    p_payment_id: notification.x_gateway_reference ?? null,
  })) as { data: boolean | null; error: { message: string } | null };

  if (error !== null) {
    throw new Error(`[orders] no se pudo cerrar la orden ${reference}: ${error.message}`);
  }

  return { changed: data === true };
}

/**
 * Referencia única de la orden: ORD-20260831-A1B2C3D4.
 *
 * Lleva la fecha por delante para que sea legible al conciliar contra el
 * panel de TUU, y un tramo aleatorio para que dos compras simultáneas no
 * colisionen. Es la clave con la que se casa el callback —y tiene índice
 * único en la base—, así que repetirla significaría marcar la orden
 * equivocada como pagada.
 */
export function newOrderReference(now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

  return `ORD-${day}-${random}`;
}
