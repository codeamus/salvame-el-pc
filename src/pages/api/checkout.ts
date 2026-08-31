import type { APIRoute } from "astro";
import { parseCheckoutPayload } from "@/lib/checkout-form";
import { describeQuote, quoteOrder } from "@/lib/orders/quote";
import { newOrderReference, saveOrder } from "@/lib/orders/store";
import { createPaymentIntent } from "@/lib/tuu/client";
import { splitFullName } from "@/lib/validation";

/**
 * Carrito → intento de pago en TUU.
 *
 * Recibe ids y cantidades (nunca precios), recalcula el total contra el
 * catálogo del servidor, crea la orden en estado "pending" y devuelve la URL
 * de la pasarela a la que el navegador tiene que redirigir.
 *
 * Este endpoint NO confirma nada: solo abre el intento. Quien decide si la
 * orden quedó pagada es /api/tuu/callback, que llega firmado desde TUU.
 */
export const prerender = false;

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

export const POST: APIRoute = async ({ request }) => {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return json({ error: "No pudimos leer los datos del pedido." }, 400);
  }

  const { items, cliente } = body as { items?: unknown; cliente?: unknown };

  // 1. El comprador. Mismas reglas que el formulario, corridas de nuevo acá:
  //    la validación del navegador se salta con un fetch a mano.
  const parsed = parseCheckoutPayload(cliente);
  if (!parsed.ok) {
    const first = Object.values(parsed.errors)[0] ?? "Revisa los datos del formulario.";
    return json({ error: first, errores: parsed.errors }, 400);
  }
  const customer = parsed.payload;

  // 2. El monto. Se relee del catálogo del servidor, incluido el envío.
  const quoted = await quoteOrder(items, customer.entrega);
  if (!quoted.ok) {
    return json({ error: quoted.error }, 400);
  }
  const { quote } = quoted;

  const reference = newOrderReference();
  const { firstName, lastName } = splitFullName(customer.nombre);

  // 3. La orden se guarda ANTES de abrir el intento. Si se guardara después,
  //    un callback muy rápido llegaría a una orden que todavía no existe y no
  //    habría contra qué validar el monto.
  const now = new Date().toISOString();
  await saveOrder({
    reference,
    amountCLP: quote.totalCLP,
    status: "pending",
    quote,
    customer,
    createdAt: now,
    updatedAt: now,
  });

  try {
    const intent = await createPaymentIntent({
      amount: quote.totalCLP,
      reference,
      description: describeQuote(quote),
      customer: {
        email: customer.correo,
        firstName,
        lastName,
        phone: customer.telefono,
      },
    });

    return json({ redirectUrl: intent.redirectUrl, reference, amount: quote.totalCLP });
  } catch (error) {
    // El detalle real va al log del servidor: puede traer pistas de la firma
    // o de las credenciales, y eso no se le muestra al comprador.
    console.error("[checkout] no se pudo crear el intento de pago", { reference, error });
    return json({ error: "No pudimos iniciar el pago. Inténtalo nuevamente." }, 502);
  }
};
