import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as SupabaseServer from "@/lib/supabase/server";
import type { CheckoutPayload } from "@/lib/checkout-form";
import type { Quote } from "./quote";
import type * as OrdersStore from "./store";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * INTEGRACIÓN CONTRA SUPABASE DE VERDAD
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Los demás tests del proyecto son puros y corren sin red. Este no: habla
 * con la base real, y por eso se salta solo cuando no hay credenciales en
 * .env. En una máquina sin configurar `pnpm test` sigue pasando entero.
 *
 * Existe porque lo que puede fallar en el store migrado no es la lógica
 * —esa está en SQL y probada allá— sino el contrato entre ambos: que los
 * nombres de los parámetros de las funciones RPC calcen, que el jsonb vuelva
 * con la misma forma con la que se guardó, y que snake_case ↔ camelCase no
 * se pierda nada en el camino. Eso solo se comprueba hablando con PostgREST.
 *
 * Deja la base como la encontró: la orden de prueba se borra al terminar.
 */

/**
 * Carga .env en process.env.
 *
 * Vite solo expone a import.meta.env las variables con prefijo VITE_, así
 * que acá no llegarían. El store lee process.env primero (es lo que existe
 * en runtime en Vercel), así que poblarlo es suficiente y no obliga a
 * cambiar la configuración global de Vitest.
 */
function loadEnv(): void {
  let contents: string;
  try {
    // cwd y no import.meta.url: bajo Vitest, import.meta.url no es una URL
    // file:// sino la del módulo servido por Vite, y resolver rutas
    // relativas contra ella deja "/.env". Vitest corre desde la raíz.
    contents = readFileSync(resolve(process.cwd(), ".env"), "utf-8");
  } catch {
    return; // Sin .env el test se salta; no es un error.
  }

  for (const line of contents.split("\n")) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match?.[1] === undefined) continue;
    process.env[match[1]] ??= (match[2] ?? "").trim().replace(/^["']|["']$/g, "");
  }
}

loadEnv();

const configurado =
  typeof process.env.SUPABASE_URL === "string" &&
  typeof process.env.SUPABASE_SERVICE_ROLE_KEY === "string";

const reference = `ORD-TEST-${Date.now().toString(36).toUpperCase()}`;

/* Dos productos reales del catálogo sembrado. Van con track_stock en false,
 * así que confirmar el pago no mueve inventario: el test no deja rastro en
 * el catálogo, solo la orden que después se borra. */
const quote: Quote = {
  lines: [
    {
      productId: 1,
      slug: "mouse-redragon-cobra-m711",
      name: "Mouse Redragon Cobra M711",
      quantity: 2,
      unitPriceCLP: 19990,
      lineTotalCLP: 39980,
    },
    {
      productId: 3,
      slug: "teclado-redragon-kumara-k552",
      name: "Teclado Redragon Kumara K552 RGB",
      quantity: 1,
      unitPriceCLP: 29990,
      lineTotalCLP: 29990,
    },
  ],
  subtotalCLP: 69970,
  shippingCLP: 3990,
  totalCLP: 73970,
};

const customer: CheckoutPayload = {
  entrega: "despacho",
  nombre: "Ana Pérez",
  rut: "11.111.111-1",
  correo: "ana@ejemplo.cl",
  telefono: "+56911111111",
  direccion: {
    region: "Región Metropolitana de Santiago",
    comuna: "Providencia",
    calle: "Av. Siempre Viva 742",
    referencia: "Depto 3",
  },
};

describe.skipIf(!configurado)("store de órdenes contra Supabase", () => {
  let store: typeof OrdersStore;
  let admin: typeof SupabaseServer;

  beforeAll(async () => {
    store = await import("./store");
    admin = await import("@/lib/supabase/server");
  });

  afterAll(async () => {
    if (!configurado) return;
    // order_items cae solo por el on delete cascade.
    await admin.getSupabaseAdmin().from("orders").delete().eq("reference", reference);
  });

  it("crea la orden en pending y la devuelve completa", async () => {
    await store.saveOrder({
      reference,
      amountCLP: quote.totalCLP,
      status: "pending",
      quote,
      customer,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const order = await store.getOrder(reference);

    expect(order).toBeDefined();
    expect(order?.status).toBe("pending");
    expect(order?.amountCLP).toBe(73970);
    // El jsonb tiene que volver idéntico: es la prueba que se firmó y cobró.
    expect(order?.quote).toEqual(quote);
    expect(order?.customer).toEqual(customer);
    // Todavía no llegó ningún callback.
    expect(order?.lastNotification).toBeUndefined();
  });

  it("expande las líneas del quote en order_items", async () => {
    const { data } = await admin
      .getSupabaseAdmin()
      .from("order_items")
      .select("slug, quantity, unit_price_clp, line_total_clp, orders!inner(reference)")
      .eq("orders.reference", reference)
      .order("slug");

    expect(data).toHaveLength(2);
    expect(data?.[0]).toMatchObject({
      slug: "mouse-redragon-cobra-m711",
      quantity: 2,
      unit_price_clp: 19990,
      line_total_clp: 39980,
    });
  });

  it("una orden inexistente es undefined, no un error", async () => {
    await expect(store.getOrder("ORD-NO-EXISTE-JAMAS")).resolves.toBeUndefined();
  });

  it("confirma el pago una sola vez, por muchos reintentos que lleguen", async () => {
    const notificacion = {
      x_reference: reference,
      x_amount: "73970",
      x_result: "completed",
      x_timestamp: new Date().toISOString(),
    };

    // Primer callback de TUU.
    await expect(store.markOrderResult(reference, "completed", notificacion)).resolves.toEqual({
      changed: true,
    });

    // TUU reintenta hasta 10 veces: el segundo no debe disparar nada.
    await expect(store.markOrderResult(reference, "completed", notificacion)).resolves.toEqual({
      changed: false,
    });

    const order = await store.getOrder(reference);
    expect(order?.status).toBe("completed");
    expect(order?.lastNotification).toEqual(notificacion);
  });

  it("un callback para una referencia desconocida no cambia nada", async () => {
    await expect(
      store.markOrderResult("ORD-NO-EXISTE-JAMAS", "failed", { x_result: "failed" }),
    ).resolves.toEqual({ changed: false });
  });
});
