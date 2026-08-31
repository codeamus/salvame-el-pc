import type { APIRoute } from "astro";
import { getOrder, markOrderResult } from "@/lib/orders/store";
import { getTuuConfig } from "@/lib/tuu/env";
import { verifySignature } from "@/lib/tuu/signature";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * NOTIFICACIÓN SERVER-TO-SERVER DE TUU — FUENTE DE VERDAD DEL PAGO
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Todo lo que sabe el sitio sobre si una compra se pagó o no entra por acá.
 * La redirección del navegador a /pago/exito es solo presentación: cualquiera
 * puede escribir esa URL a mano.
 *
 * Reglas del protocolo que este endpoint tiene que respetar:
 *
 *   · Llega como POST con Content-Type application/x-www-form-urlencoded.
 *   · Hay que responder en menos de ~5 segundos.
 *   · Un 200 le dice a TUU que deje de reintentar. Con 4xx/5xx reintenta
 *     hasta 10 veces con backoff exponencial.
 *   · Por lo tanto tiene que ser idempotente: la misma notificación va a
 *     llegar más de una vez.
 */
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const config = getTuuConfig();

  const raw = await request.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const { x_signature: received, ...signed } = params;

  // El body crudo se registra completo a propósito: es lo único con lo que se
  // puede conciliar contra el panel de TUU si aparece una diferencia, y en el
  // primer pago real es lo que confirma qué campos manda TUU de verdad.
  console.info("[tuu:callback] recibido", { raw });

  // Firma inválida ⇒ no se procesa NADA. Sin esta verificación, cualquiera
  // que conozca una referencia puede marcar su propia orden como pagada con
  // un curl. El 400 es deliberado: que TUU reintente si fue un problema real.
  const valid =
    received !== undefined && (await verifySignature(signed, received, config.secretKey));

  if (!valid) {
    console.error("[tuu:callback] firma inválida", { reference: params.x_reference });
    return new Response("invalid signature", { status: 400 });
  }

  const reference = params.x_reference ?? "";
  const order = await getOrder(reference);

  // Sin la orden en el store no hay contra qué validar el monto. Se responde
  // 200 igual —reintentar no la va a hacer aparecer— pero queda en el log.
  //
  // ⚠️ Con el store en memoria esto pasa seguido en Vercel: el callback cae
  // en otra instancia. Ver docs/pagos-tuu.md § "Deuda técnica".
  if (order === undefined) {
    console.error("[tuu:callback] orden no encontrada", { reference });
    return new Response("ok", { status: 200 });
  }

  // El monto que informa TUU tiene que ser el que calculamos nosotros. Si no
  // calza, algo se rompió en el camino y no se marca nada como pagado.
  if (Number(params.x_amount) !== order.amountCLP) {
    console.error("[tuu:callback] el monto no coincide", {
      reference,
      esperado: order.amountCLP,
      recibido: params.x_amount,
    });
    return new Response("ok", { status: 200 });
  }

  // "pending" no es un estado final: TUU volverá a avisar cuando se resuelva.
  if (params.x_result === "pending") {
    return new Response("ok", { status: 200 });
  }

  const status = params.x_result === "completed" ? "completed" : "failed";
  const { changed } = await markOrderResult(reference, status, params);

  if (changed && status === "completed") {
    // TODO(pagos): acá va lo que dispara la venta — correo al comprador,
    // aviso al equipo, descuento de stock y emisión de boleta. Va dentro del
    // `changed` justamente para que un reintento no lo ejecute dos veces.
    console.info("[tuu:callback] pago confirmado", { reference, amount: order.amountCLP });
  }

  return new Response("ok", { status: 200 });
};

/** Un monitor o el propio TUU pueden hacer GET acá; no debe verse como un error. */
export const GET: APIRoute = () => new Response("ok", { status: 200 });
