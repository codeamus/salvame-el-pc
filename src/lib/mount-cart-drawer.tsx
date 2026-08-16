import { createRoot, type Root } from "react-dom/client";
import CartDrawer from "@/components/cart/CartDrawer";

/**
 * Monta el panel del carrito bajo demanda.
 *
 * No es un island de Astro a propósito. Un `client:idle` en el layout habría
 * cargado React en TODAS las páginas —la portada pasaba de ~20 KB de JS a
 * 204 KB— y la portada y el catálogo son justamente las dos páginas que el
 * proyecto mantiene sin framework. Acá React llega solo cuando el visitante
 * abre el carrito, que es la primera vez que hace falta de verdad.
 *
 * El contenedor lleva `transition:persist` en el layout para que el
 * ClientRouter no lo reemplace al navegar: si se fuera, la raíz de React
 * quedaría colgando de un nodo que ya no está en el documento.
 */

let root: Root | null = null;
let mountedOn: HTMLElement | null = null;

export function mountCartDrawer(): void {
  const container = document.getElementById("cart-drawer-root");
  if (!container) return;

  // Si el contenedor sigue siendo el mismo nodo, ya está montado.
  if (root && mountedOn === container) return;

  root?.unmount();
  mountedOn = container;
  root = createRoot(container);
  root.render(<CartDrawer />);
}
