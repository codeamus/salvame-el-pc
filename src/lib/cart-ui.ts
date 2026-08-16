import {
  $cartCount,
  addToCart,
  MAX_QUANTITY_PER_LINE,
  openCartDrawer,
  type CartProduct,
} from "@/lib/cart-store";
import { $toast, showToast } from "@/lib/toast-store";

/**
 * Pegamento entre los stores y el HTML estático: contador del header, toast,
 * selector de cantidad de las cards y apertura del panel del carrito.
 *
 * Es vanilla y no un island de React a propósito. La portada y el catálogo
 * hoy no cargan React, y ese es el motivo de que sean tan livianos; hidratar
 * un framework para un contador y doce steppers lo tiraría por la borda.
 *
 * Con <ClientRouter /> el body se reemplaza en cada navegación pero este
 * módulo corre UNA sola vez: por eso todo va por delegación en `document` y
 * el repintado se re-dispara en `astro:page-load`.
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
 * Carga y monta el panel del carrito la primera vez que se necesita.
 *
 * El import dinámico es lo que mantiene React fuera de la portada y del
 * catálogo: el chunk viaja recién cuando el visitante abre el carrito.
 * La promesa se cachea para que dos clics no monten dos veces.
 */
let drawerLoading: Promise<void> | null = null;

function loadDrawer(): Promise<void> {
  drawerLoading ??= import("@/lib/mount-cart-drawer").then((module) => {
    module.mountCartDrawer();
  });
  return drawerLoading;
}

/* Se adelanta la descarga al asomar el cursor o al enfocar con el teclado,
 * así el panel abre sin espera perceptible en el clic real. */
for (const evento of ["pointerenter", "focusin"] as const) {
  document.addEventListener(
    evento,
    (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-cart-open]")) void loadDrawer();
    },
    true,
  );
}

/** Lee la cantidad elegida en una card. Devuelve 1 si el nodo no está. */
function readQuantity(form: Element | null): { node: HTMLElement | null; value: number } {
  const node = form?.querySelector<HTMLElement>("[data-qty-value]") ?? null;
  const parsed = Number.parseInt(node?.textContent ?? "1", 10);
  return { node, value: Number.isNaN(parsed) ? 1 : parsed };
}

function writeQuantity(node: HTMLElement | null, value: number): void {
  if (node) node.textContent = String(value);
}

/*
 * En FASE DE CAPTURA, no en la de burbuja.
 *
 * El ClientRouter de Astro registra su propio listener de clics en el
 * documento desde el <head>, o sea antes que este módulo, y es el que
 * convierte los <a> en navegaciones con transición. Escuchando en burbuja,
 * el router ya había arrancado la navegación cuando llegaba nuestro
 * preventDefault: el botón del carrito se iba a /carrito en vez de abrir el
 * panel. En captura corremos primero y el router respeta defaultPrevented.
 */
document.addEventListener(
  "click",
  (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    /* ── Selector de cantidad de las cards ─────────────────────────────── */
    const step = target.closest<HTMLElement>("[data-qty-dec], [data-qty-inc]");
    if (step) {
      event.preventDefault();
      const { node, value } = readQuantity(step.closest("[data-qty-form]"));
      const next = step.hasAttribute("data-qty-inc")
        ? Math.min(MAX_QUANTITY_PER_LINE, value + 1)
        : Math.max(1, value - 1);
      writeQuantity(node, next);
      return;
    }

    /* ── Agregar al carrito desde una card ─────────────────────────────── */
    const add = target.closest<HTMLElement>("[data-add-to-cart]");
    if (add) {
      const payload = add.getAttribute("data-add-to-cart");
      if (!payload) return;

      event.preventDefault();
      const product = JSON.parse(payload) as CartProduct;
      const form = add.closest("[data-qty-form]");
      const { node, value } = readQuantity(form);

      addToCart(product, value);
      showToast(
        value === 1 ? `Agregado: ${product.name}` : `Agregado: ${product.name} ×${String(value)}`,
      );
      // La card vuelve a 1: la cantidad elegida ya viajó al carrito y dejarla
      // en 5 hace que el siguiente clic agregue otras 5 sin querer.
      writeQuantity(node, 1);
      return;
    }

    /* ── Abrir el panel del carrito ────────────────────────────────────── */
    const openTrigger = target.closest<HTMLElement>("[data-cart-open]");
    if (openTrigger) {
      event.preventDefault();
      void loadDrawer().then(
        () => {
          openCartDrawer();
        },
        (error: unknown) => {
          // Si el panel no carga (red caída, bloqueador), el botón hace lo que
          // dice su href en vez de quedarse muerto. El error se registra: sin
          // esto, un fallo al montar se ve igual que un enlace normal y el bug
          // queda invisible.
          console.error("No se pudo abrir el panel del carrito:", error);
          window.location.href = "/carrito";
        },
      );
    }
  },
  true,
);
