import { getProductById } from "@/data/products";
import { aplicarReglasDePedido } from "@/data/order-rules";
import { maxQuantityPerLine, shippingFor } from "@/lib/order-rules";
import type { DeliveryMethod } from "@/lib/checkout-form";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * COTIZACIÓN DEL PEDIDO EN EL SERVIDOR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Esto es lo que impide que alguien pague $1 por una GPU.
 *
 * El carrito vive en el localStorage del visitante, así que cualquiera puede
 * abrir las devtools y escribir el precio que quiera. Por eso el navegador
 * solo manda ids y cantidades: los precios se releen del catálogo acá, en el
 * servidor, y el total que se firma y se cobra sale de este módulo.
 *
 * La firma HMAC de TUU garantiza que el monto no se alteró EN EL CAMINO —
 * no que el monto sea el correcto. Eso lo garantiza este archivo.
 */

/** Lo que manda el navegador por línea: nunca un precio. */
export interface QuoteItemInput {
  readonly id: number;
  readonly quantity: number;
}

export interface QuoteLine {
  readonly productId: number;
  readonly slug: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceCLP: number;
  readonly lineTotalCLP: number;
}

export interface Quote {
  readonly lines: readonly QuoteLine[];
  readonly subtotalCLP: number;
  readonly shippingCLP: number;
  readonly totalCLP: number;
}

export type QuoteResult =
  { readonly ok: true; readonly quote: Quote } | { readonly ok: false; readonly error: string };

/** Tope de líneas distintas: un carrito legítimo no trae 200 productos. */
const MAX_LINES = 50;

function parseItem(value: unknown): QuoteItemInput | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Record<string, unknown>;
  const id = Number(raw.id);
  const quantity = Number(raw.quantity);

  if (!Number.isInteger(id) || id <= 0) return null;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantityPerLine()) return null;

  return { id, quantity };
}

/**
 * Recalcula el pedido completo desde el catálogo del servidor.
 *
 * Devuelve un resultado en vez de lanzar porque cada motivo de rechazo tiene
 * un mensaje distinto que el comprador necesita ver: "ese producto ya no
 * existe" no es lo mismo que "la cantidad no es válida".
 */
export async function quoteOrder(items: unknown, entrega: DeliveryMethod): Promise<QuoteResult> {
  /*
   * Las reglas de envío se releen ANTES de cotizar.
   *
   * Este endpoint atiende su propia petición: no renderizó ninguna página, y
   * el módulo puede venir reciclado de una invocación anterior con valores
   * viejos. Sin esta línea cobraría el envío por defecto mientras el carrito
   * le muestra al comprador el configurado en el panel — un monto en
   * pantalla y otro en la pasarela.
   */
  await aplicarReglasDePedido();

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "El carrito está vacío." };
  }
  if (items.length > MAX_LINES) {
    return { ok: false, error: "Demasiados productos distintos en el carrito." };
  }

  const seen = new Set<number>();
  const lines: QuoteLine[] = [];

  for (const raw of items) {
    const item = parseItem(raw);
    if (item === null) {
      return { ok: false, error: "Hay una línea del carrito con datos inválidos." };
    }

    // Una misma línea repetida duplicaría el cobro sin que se note en pantalla.
    if (seen.has(item.id)) {
      return { ok: false, error: "El carrito trae un producto repetido." };
    }
    seen.add(item.id);

    const product = await getProductById(item.id);
    if (product === null) {
      return { ok: false, error: "Uno de los productos ya no está disponible." };
    }

    lines.push({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      quantity: item.quantity,
      unitPriceCLP: product.priceCLP,
      lineTotalCLP: product.priceCLP * item.quantity,
    });
  }

  const subtotalCLP = lines.reduce((sum, line) => sum + line.lineTotalCLP, 0);

  // Acordar la entrega no cuesta: el punto se define en conjunto, no hay
  // repartidor de por medio. Misma regla que muestra el checkout en pantalla.
  const shippingCLP = entrega === "despacho" ? shippingFor(subtotalCLP) : 0;
  const totalCLP = subtotalCLP + shippingCLP;

  // TUU exige un entero CLP: si esto no se cumple, la firma no calza y el
  // error aparece recién en la pasarela, donde es mucho más difícil de leer.
  if (!Number.isInteger(totalCLP) || totalCLP <= 0) {
    return { ok: false, error: "El total del pedido no es válido." };
  }

  return { ok: true, quote: { lines, subtotalCLP, shippingCLP, totalCLP } };
}

/** Descripción corta del pedido, para que el comprador la vea en la pasarela. */
export function describeQuote(quote: Quote): string {
  return quote.lines
    .map((line) => `${line.quantity}x ${line.name}`)
    .join(", ")
    .slice(0, 120);
}
