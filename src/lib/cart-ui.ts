import { $cartCount, addToCart, type CartProduct } from "@/lib/cart-store";
import { $toast, showToast } from "@/lib/toast-store";

/**
 * Pegamento entre los stores y el DOM estático del layout (contador del
 * header y toast). Es vanilla y no un island de React a propósito: son dos
 * textos reactivos, no ameritan hidratar un framework.
 *
 * Con <ClientRouter /> el body se reemplaza en cada navegación pero este
 * módulo corre UNA sola vez, por eso cada render busca los nodos de nuevo y
 * `astro:page-load` re-pinta tras cada swap.
 */

function renderCount(count: number): void {
  for (const el of document.querySelectorAll("[data-cart-count]")) {
    el.textContent = String(count);
  }
}

function renderToast(message: string): void {
  const toast = document.querySelector<HTMLElement>("[data-toast]");
  if (!toast) return;
  const text = toast.querySelector("[data-toast-message]");
  if (text) text.textContent = message;
  toast.hidden = message === "";
}

$cartCount.subscribe(renderCount);
$toast.subscribe(renderToast);

document.addEventListener("astro:page-load", () => {
  renderCount($cartCount.get());
  renderToast($toast.get());
});

/**
 * Delegación del botón "+" de las cards estáticas (home, catálogo).
 * El botón lleva el producto serializado en data-add-to-cart; los islands
 * de React (ficha, carrito) usan addToCart directo y no pasan por acá.
 */
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLElement>("[data-add-to-cart]");
  if (!button) return;

  const payload = button.getAttribute("data-add-to-cart");
  if (!payload) return;

  event.preventDefault();
  const product = JSON.parse(payload) as CartProduct;
  addToCart(product);
  showToast(`Agregado: ${product.name}`);
});
