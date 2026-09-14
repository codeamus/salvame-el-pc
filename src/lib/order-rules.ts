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
 * un monto en pantalla y otro en la pasarela. Eso no es un detalle: que la
 * letra chica contradiga al checkout es el tipo de incumplimiento que
 * sanciona el SERNAC.
 *
 * ── Por qué son mutables ──────────────────────────────────────────────────
 *
 * Eran constantes hasta que el envío pasó a configurarse desde el panel. El
 * problema es que el carrito calcula el envío EN EL NAVEGADOR, donde no hay
 * forma de consultar la base: los valores tienen que viajar con la página.
 *
 * Por eso el módulo guarda las reglas en una variable y expone
 * `setOrderRules`. En el servidor las inyecta el layout desde site_settings;
 * en el navegador, un script que el mismo layout deja escrito en el HTML.
 * Los valores de reserva son los del handoff, así que si la inyección
 * fallara el sitio cobra lo de siempre en vez de cobrar cero.
 */

export interface OrderRules {
  readonly shippingCostCLP: number;
  readonly freeShippingFromCLP: number;
  readonly maxQuantityPerLine: number;
}

/** Reglas del handoff: $3.990, gratis desde $50.000, tope de 20 por línea. */
export const DEFAULT_ORDER_RULES: OrderRules = {
  shippingCostCLP: 3990,
  freeShippingFromCLP: 50000,
  maxQuantityPerLine: 20,
};

let reglas: OrderRules = DEFAULT_ORDER_RULES;

/**
 * Reemplaza las reglas vigentes.
 *
 * Ignora lo que no sea un entero no negativo en vez de confiar: el valor
 * llega de jsonb editable, y un `null` o un `"3990"` convertirían el costo
 * de envío en NaN. Un NaN acá no falla en ninguna parte visible — se
 * propaga al total y el comprador termina viendo "$NaN" o pagando de menos.
 */
export function setOrderRules(nuevas: Partial<Record<keyof OrderRules, unknown>>): void {
  const valido = (valor: unknown): valor is number =>
    typeof valor === "number" && Number.isInteger(valor) && valor >= 0;

  reglas = {
    shippingCostCLP: valido(nuevas.shippingCostCLP)
      ? nuevas.shippingCostCLP
      : reglas.shippingCostCLP,
    freeShippingFromCLP: valido(nuevas.freeShippingFromCLP)
      ? nuevas.freeShippingFromCLP
      : reglas.freeShippingFromCLP,
    maxQuantityPerLine:
      valido(nuevas.maxQuantityPerLine) && nuevas.maxQuantityPerLine > 0
        ? nuevas.maxQuantityPerLine
        : reglas.maxQuantityPerLine,
  };
}

/** Vuelve a los valores del handoff. Para los tests. */
export function resetOrderRules(): void {
  reglas = DEFAULT_ORDER_RULES;
}

export function getOrderRules(): OrderRules {
  return reglas;
}

export function shippingCostCLP(): number {
  return reglas.shippingCostCLP;
}

export function freeShippingFromCLP(): number {
  return reglas.freeShippingFromCLP;
}

/** Tope por línea, para evitar que alguien escriba 99999 en el input. */
export function maxQuantityPerLine(): number {
  return reglas.maxQuantityPerLine;
}

/** Costo de envío según subtotal: 0 con carrito vacío o sobre el umbral. */
export function shippingFor(subtotal: number): number {
  if (subtotal === 0) return 0;
  return subtotal >= reglas.freeShippingFromCLP ? 0 : reglas.shippingCostCLP;
}
