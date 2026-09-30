import { persistentAtom } from "@nanostores/persistent";
import { atom, computed } from "nanostores";
import { maxQuantityPerLine, setOrderRules, shippingFor } from "@/lib/order-rules";
import type { PriceCLP, Product } from "@/types/product";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * ESTADO DEL CARRITO
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Vive en el navegador del visitante (localStorage), no en un servidor.
 * Astro renderiza cada island de forma aislada, así que sin un store
 * compartido el botón "agregar" de la ficha de producto y el contador del
 * header no se enterarían el uno del otro.
 *
 * IMPORTANTE — el precio guardado acá es solo para mostrar en pantalla.
 * Cualquiera puede editar el localStorage desde las devtools, así que el
 * total que se cobra NO sale de acá: /api/checkout relee los precios del
 * catálogo del servidor y recalcula todo (ver src/lib/orders/quote.ts).
 */

export interface CartLine {
  readonly productId: number;
  readonly slug: string;
  readonly name: string;
  readonly brand: string;
  /** Para el thumbnail en el carrito. */
  readonly photo: string;
  readonly priceCLP: PriceCLP;
  readonly quantity: number;
}

/**
 * Las reglas de negocio del pedido (tope por línea, costo de envío) viven en
 * order-rules.ts porque el servidor las necesita para recalcular el total, y
 * este módulo no se puede importar en Node: persistentAtom asume localStorage.
 * Se re-exportan para que los componentes sigan pidiéndoselas al carrito.
 */
export {
  freeShippingFromCLP,
  maxQuantityPerLine,
  shippingCostCLP,
  shippingFor,
} from "@/lib/order-rules";

function serialize(lines: readonly CartLine[]): string {
  return JSON.stringify(lines);
}

/**
 * Decodifica el carrito guardado en localStorage.
 *
 * Se exporta (además de usarse internamente) porque es código defensivo con
 * varias ramas y merece test directo: el localStorage puede tener datos de
 * una versión anterior del sitio, JSON roto, o cualquier cosa que alguien
 * haya escrito a mano desde las devtools. Nunca se confía en su forma.
 */
export function deserialize(raw: string): CartLine[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filtro defensivo: el localStorage puede tener datos viejos o corruptos
    // de una versión anterior del sitio. Nunca confiar en su forma.
    return parsed.filter(isCartLine);
  } catch {
    return [];
  }
}

export function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.productId === "number" &&
    typeof line.slug === "string" &&
    typeof line.name === "string" &&
    typeof line.brand === "string" &&
    typeof line.photo === "string" &&
    typeof line.priceCLP === "number" &&
    typeof line.quantity === "number" &&
    line.quantity > 0
  );
}

/*
 * Reglas de envío inyectadas por el servidor.
 *
 * El layout deja un <script type="application/json" data-reglas-envio> con
 * lo que el admin configuró. Se lee acá, al cargar el módulo, porque
 * cart-store es lo primero que importa cualquier componente del carrito: sea
 * el cajón, la vista o el checkout, quien llegue primero deja las reglas
 * puestas antes de que se calcule ningún total.
 *
 * Si el script no está —una página sin layout, un test— se mantienen los
 * valores del handoff. La alternativa, cobrar cero por envío, es peor que
 * cobrar de más.
 */
function leerReglasInyectadas(): void {
  if (typeof document === "undefined") return;

  const nodo = document.querySelector("[data-reglas-envio]");
  if (nodo?.textContent == null) return;

  try {
    setOrderRules(JSON.parse(nodo.textContent) as Record<string, unknown>);
  } catch {
    // JSON corrupto: se siguen usando las reglas por defecto. No hay nada
    // que mostrarle al comprador sobre esto.
  }
}

leerReglasInyectadas();

export const $cart = persistentAtom<readonly CartLine[]>("salvameelpc:cart", [], {
  encode: serialize,
  decode: deserialize,
});

/** Cantidad total de unidades — para el chip del header. */
export const $cartCount = computed($cart, (lines) =>
  lines.reduce((total, line) => total + line.quantity, 0),
);

/** Suma de líneas, sin envío. */
export const $cartSubtotal = computed($cart, (lines) =>
  lines.reduce((total, line) => total + line.priceCLP * line.quantity, 0),
);

export const $cartShipping = computed($cartSubtotal, shippingFor);

/** Total a pagar, en CLP. Solo referencial (ver nota de arriba). */
export const $cartTotal = computed(
  [$cartSubtotal, $cartShipping],
  (subtotal, shipping) => subtotal + shipping,
);

function clampQuantity(quantity: number): number {
  return Math.max(1, Math.min(maxQuantityPerLine(), Math.floor(quantity)));
}

/**
 * Lo mínimo que el carrito necesita saber de un producto. Es un Pick del
 * Product real para que las cards estáticas puedan serializarlo en un
 * data-attribute sin arrastrar las specs completas.
 */
export type CartProduct = Pick<Product, "id" | "slug" | "name" | "brand" | "photo" | "priceCLP">;

export function addToCart(product: CartProduct, quantity = 1): void {
  const lines = $cart.get();
  const existing = lines.find((line) => line.productId === product.id);

  if (existing) {
    updateQuantity(product.id, existing.quantity + quantity);
    return;
  }

  $cart.set([
    ...lines,
    {
      productId: product.id,
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      photo: product.photo,
      priceCLP: product.priceCLP,
      quantity: clampQuantity(quantity),
    },
  ]);
}

export function updateQuantity(productId: number, quantity: number): void {
  if (quantity < 1) {
    removeFromCart(productId);
    return;
  }

  $cart.set(
    $cart
      .get()
      .map((line) =>
        line.productId === productId ? { ...line, quantity: clampQuantity(quantity) } : line,
      ),
  );
}

export function removeFromCart(productId: number): void {
  $cart.set($cart.get().filter((line) => line.productId !== productId));
}

export function clearCart(): void {
  $cart.set([]);
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * PANEL LATERAL DEL CARRITO
 * ─────────────────────────────────────────────────────────────────────────
 *
 * El estado de abierto/cerrado vive en el store y no dentro del componente
 * porque los dos extremos están en mundos distintos: lo abre el botón del
 * header, que es HTML estático manejado por cart-ui.ts, y lo pinta un island
 * de React. El store es el único punto donde se encuentran.
 */
export const $cartDrawerOpen = atom(false);

export function openCartDrawer(): void {
  $cartDrawerOpen.set(true);
}

export function closeCartDrawer(): void {
  $cartDrawerOpen.set(false);
}
