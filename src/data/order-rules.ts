import { getSettings, numero } from "@/data/content";
import { DEFAULT_ORDER_RULES, setOrderRules, type OrderRules } from "@/lib/order-rules";

/**
 * Reglas de envío desde site_settings — SOLO servidor.
 *
 * Vive aparte de src/lib/order-rules.ts a propósito: ese módulo lo importa
 * el carrito, que corre en el navegador. Si la lectura de Supabase viviera
 * ahí, el cliente de la base terminaría en el bundle del cliente.
 *
 * Se llama desde dos sitios y los dos importan:
 *
 *   · El layout, para que la página renderice con las reglas correctas y
 *     para dejárselas escritas al carrito.
 *   · /api/checkout, ANTES de cotizar. Ese endpoint atiende una petición
 *     propia, sin haber renderizado ninguna página: sin esta llamada
 *     cobraría con los valores de reserva mientras el carrito muestra los
 *     configurados. El comprador vería un monto en pantalla y otro en la
 *     pasarela.
 */
export async function aplicarReglasDePedido(): Promise<OrderRules> {
  const ajustes = await getSettings();

  const reglas: OrderRules = {
    shippingCostCLP: numero(ajustes, "shipping.cost_clp", DEFAULT_ORDER_RULES.shippingCostCLP),
    freeShippingFromCLP: numero(
      ajustes,
      "shipping.free_from_clp",
      DEFAULT_ORDER_RULES.freeShippingFromCLP,
    ),
    maxQuantityPerLine: numero(
      ajustes,
      "shipping.max_quantity_per_line",
      DEFAULT_ORDER_RULES.maxQuantityPerLine,
    ),
  };

  setOrderRules(reglas);
  return reglas;
}
