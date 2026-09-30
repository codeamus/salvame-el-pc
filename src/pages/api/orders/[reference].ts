import type { APIRoute } from "astro";
import { getOrder } from "@/lib/orders/store";

/**
 * Estado de una orden, para el polling de /pago/exito.
 *
 * Devuelve lo mínimo: estado y monto. Nada de RUT, dirección ni correo — la
 * referencia viaja en la URL y no es un secreto, así que este endpoint no
 * puede ser una forma de leer los datos personales de un comprador.
 */
export const prerender = false;

const json = (data: unknown, status: number): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // El estado cambia cuando llega el callback: cachearlo dejaría al
      // comprador mirando un "pendiente" que ya no es cierto.
      "Cache-Control": "no-store",
    },
  });

export const GET: APIRoute = async ({ params }) => {
  const reference = params.reference ?? "";
  const order = await getOrder(reference);

  if (order === undefined) {
    return json({ reference, status: "unknown" }, 404);
  }

  return json({ reference: order.reference, status: order.status, amount: order.amountCLP }, 200);
};
