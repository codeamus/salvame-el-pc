/**
 * ─────────────────────────────────────────────────────────────────────────
 * REGLAS DEL PEDIDO — compartidas entre navegador y servidor
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Viven en su propio módulo y no dentro de cart-store porque el servidor
 * también las necesita: el total que se le cobra al comprador se recalcula
 * en /api/checkout, y ese endpoint no puede importar cart-store —arrastra
 * @nanostores/persistent, que asume localStorage y no existe en Node.
 *
 * Si el costo de envío del carrito y el del cobro real salieran de dos
 * lugares distintos, tarde o temprano dejan de coincidir y el comprador ve
 * un monto en pantalla y otro en la pasarela.
 */

/** Reglas de envío del handoff: $3.990, gratis desde $50.000. */
export const SHIPPING_COST_CLP = 3990;
export const FREE_SHIPPING_FROM_CLP = 50000;

/** Tope por línea, para evitar que alguien escriba 99999 en el input. */
export const MAX_QUANTITY_PER_LINE = 20;

/** Costo de envío según subtotal: 0 con carrito vacío o sobre el umbral. */
export function shippingFor(subtotal: number): number {
  if (subtotal === 0) return 0;
  return subtotal >= FREE_SHIPPING_FROM_CLP ? 0 : SHIPPING_COST_CLP;
}
