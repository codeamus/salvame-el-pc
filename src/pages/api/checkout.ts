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

/**
 * Mensaje legible de un error, para el log del servidor.
 *
 * `console.error("algo", { error })` con un Error adentro es una trampa: casi
 * todo pipeline de logs lo pasa por JSON.stringify, y un Error serializa como
 * `{}` porque `message` y `stack` no son enumerables. El resultado es un log
 * que dice exactamente nada justo cuando más falta hace — que es lo que pasó
 * depurando el 502 en Vercel.
 */
function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

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
  try {
    await saveOrder({
      reference,
      amountCLP: quote.totalCLP,
      status: "pending",
      quote,
      customer,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    // Guardar la orden dejó de ser una escritura en memoria que no podía
    // fallar: ahora es una llamada de red a Supabase, y puede fallar por
    // credenciales mal configuradas en el deploy o por la base caída.
    //
    // Sin este catch, ese fallo sale como un 500 pelado de Astro: el
    // comprador ve "Internal Server Error" y quien depura no tiene ni idea
    // de cuál de los tres pasos del checkout reventó. El detalle real va al
    // log del servidor —puede traer nombres de variables y URLs— y al
    // comprador se le dice algo accionable.
    console.error(`[checkout] no se pudo guardar la orden ${reference}: ${describeError(error)}`);
    return json(
      { error: "No pudimos registrar tu pedido. Inténtalo nuevamente en unos minutos." },
      503,
    );
  }

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
    console.error(
      `[checkout] no se pudo crear el intento de pago ${reference}: ${describeError(error)}`,
    );
    return json({ error: "No pudimos iniciar el pago. Inténtalo nuevamente." }, 502);
  }
};
