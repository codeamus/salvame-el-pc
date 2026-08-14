import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { obtenerPago } from "@/lib/mercadopago";
import { enviarConfirmacionDePedido } from "@/lib/resend";

export const prerender = false;

/**
 * Valida la firma x-signature que manda MercadoPago para confirmar que el
 * webhook es realmente de ellos y no de alguien pegándole a esta URL a mano.
 * https://www.mercadopago.cl/developers/es/docs/checkout-api/webhooks
 */
function validarFirma(request: Request, dataId: string): boolean {
  const signatureHeader = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  if (!signatureHeader || !requestId) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.trim().split("=") as [string, string]),
  );
  const { ts, v1 } = parts;
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto
    .createHmac("sha256", import.meta.env.MERCADOPAGO_WEBHOOK_SECRET)
    .update(manifest)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

export const POST: APIRoute = async ({ request, url }) => {
  const dataId = url.searchParams.get("data.id") ?? "";

  if (!validarFirma(request, dataId)) {
    return new Response("Firma inválida", { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (body?.type !== "payment") {
    // MercadoPago manda otros tipos de eventos que no nos interesan.
    return new Response("ok", { status: 200 });
  }

  // Nunca confiamos en el estado que viene en el payload: siempre lo
  // reconfirmamos contra la API de MercadoPago.
  const payment = await obtenerPago(body.data.id);
  const orderId = payment.external_reference;

  if (!orderId) {
    return new Response("Sin external_reference", { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  if (payment.status === "approved") {
    // Función SQL transaccional: descuenta stock + marca la orden como
    // pagada de forma atómica. Ver supabase/schema.sql.
    const { error } = await supabase.rpc("confirmar_pago_y_descontar_stock", {
      p_order_id: orderId,
      p_payment_id: String(payment.id),
    });

    if (error) {
      console.error("Error confirmando pago:", error);
      return new Response("Error interno", { status: 500 });
    }

    const { data: order } = await supabase
      .from("orders")
      .select("*, order_items(quantity, unit_price_clp, products(name))")
      .eq("id", orderId)
      .single();

    if (order) {
      await enviarConfirmacionDePedido({
        to: order.customer_email,
        orderId: order.id,
        items: order.order_items.map((i: any) => ({
          title: i.products.name,
          quantity: i.quantity,
          unitPrice: i.unit_price_clp,
        })),
        total: order.total_clp,
      });

      // TODO: acá también dispara la emisión del DTE (boleta electrónica)
      // contra el proveedor de facturación elegido (ver decisión en el
      // doc de arquitectura del proyecto).
    }
  }

  return new Response("ok", { status: 200 });
};
