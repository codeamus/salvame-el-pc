import type { APIRoute } from "astro";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { crearPreferenciaDePago } from "@/lib/mercadopago";

export const prerender = false;

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  email: z.email().optional(),
});

/**
 * Crea un pedido "pendiente" en la base y una preferencia de pago en
 * MercadoPago. IMPORTANTE: el precio SIEMPRE se vuelve a leer desde la base
 * de datos acá (nunca se confía en el precio que venga del browser) — así
 * evitamos que alguien manipule el total del carrito desde el cliente.
 */
export const POST: APIRoute = async ({ request }) => {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Datos inválidos" }), { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { items, email } = parsed.data;

  // Traemos precio y stock reales desde la DB, no del payload del cliente.
  const productIds = items.map((i) => i.id);
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, price_clp, stock")
    .in("id", productIds);

  if (error || !products || products.length !== productIds.length) {
    return new Response(JSON.stringify({ error: "Producto no encontrado" }), { status: 400 });
  }

  for (const item of items) {
    const product = products.find((p) => p.id === item.id)!;
    if (product.stock < item.quantity) {
      return new Response(
        JSON.stringify({ error: `Sin stock suficiente de "${product.name}"` }),
        { status: 409 },
      );
    }
  }

  const total = items.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.id)!;
    return sum + product.price_clp * item.quantity;
  }, 0);

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      status: "pendiente",
      customer_email: email ?? "sin-email@salvameelpc.cl",
      total_clp: total,
    })
    .select()
    .single();

  if (orderError || !order) {
    return new Response(JSON.stringify({ error: "No se pudo crear el pedido" }), { status: 500 });
  }

  await supabase.from("order_items").insert(
    items.map((item) => {
      const product = products.find((p) => p.id === item.id)!;
      return {
        order_id: order.id,
        product_id: product.id,
        quantity: item.quantity,
        unit_price_clp: product.price_clp,
      };
    }),
  );

  const { checkoutUrl, preferenceId } = await crearPreferenciaDePago({
    orderId: order.id,
    items: items.map((item) => {
      const product = products.find((p) => p.id === item.id)!;
      return { title: product.name, quantity: item.quantity, unitPrice: product.price_clp };
    }),
    payerEmail: email,
  });

  await supabase
    .from("orders")
    .update({ mercadopago_preference_id: preferenceId })
    .eq("id", order.id);

  return new Response(JSON.stringify({ checkoutUrl }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
