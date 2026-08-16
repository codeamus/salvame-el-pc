import { persistentAtom } from "@nanostores/persistent";
import { atom, computed } from "nanostores";
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
 * Cuando se conecte Mercado Pago, el total SIEMPRE debe recalcularse en el
 * servidor leyendo el precio real de la base de datos, porque cualquiera
 * puede editar el localStorage desde las devtools.
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

/** Tope por línea, para evitar que alguien escriba 99999 en el input. */
export const MAX_QUANTITY_PER_LINE = 20;

/** Reglas de envío del handoff: $3.990, gratis desde $50.000. */
export const SHIPPING_COST_CLP = 3990;
export const FREE_SHIPPING_FROM_CLP = 50000;

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

/** Costo de envío según subtotal: 0 con carrito vacío o sobre el umbral. */
export function shippingFor(subtotal: number): number {
  if (subtotal === 0) return 0;
  return subtotal >= FREE_SHIPPING_FROM_CLP ? 0 : SHIPPING_COST_CLP;
}

export const $cartShipping = computed($cartSubtotal, shippingFor);

/** Total a pagar, en CLP. Solo referencial (ver nota de arriba). */
export const $cartTotal = computed(
  [$cartSubtotal, $cartShipping],
  (subtotal, shipping) => subtotal + shipping,
);

function clampQuantity(quantity: number): number {
  return Math.max(1, Math.min(MAX_QUANTITY_PER_LINE, Math.floor(quantity)));
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
