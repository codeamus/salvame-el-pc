import { useEffect, useRef } from "react";
import { useStore } from "@nanostores/react";
import CartLines from "@/components/cart/CartLines";
import {
  $cart,
  $cartCount,
  $cartDrawerOpen,
  $cartShipping,
  $cartSubtotal,
  $cartTotal,
  closeCartDrawer,
  FREE_SHIPPING_FROM_CLP,
} from "@/lib/cart-store";
import { formatCLP } from "@/lib/format";

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Panel lateral del carrito.
 *
 * Se monta una sola vez en el layout y se abre desde el botón del header,
 * que es HTML estático: el puente entre ambos es el store $cartDrawerOpen
 * (ver cart-ui.ts). Mientras está cerrado no renderiza nada.
 *
 * La página /carrito sigue existiendo y comparte la lista con este panel:
 * es la versión enlazable y la que ve quien llega sin JavaScript.
 */
export default function CartDrawer() {
  const open = useStore($cartDrawerOpen);
  const lines = useStore($cart);
  const count = useStore($cartCount);
  const subtotal = useStore($cartSubtotal);
  const shipping = useStore($cartShipping);
  const total = useStore($cartTotal);

  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  // Al navegar (el panel tiene enlaces a fichas) se cierra solo.
  useEffect(() => {
    document.addEventListener("astro:page-load", closeCartDrawer);
    return () => {
      document.removeEventListener("astro:page-load", closeCartDrawer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    // Sin esto, al hacer scroll dentro del panel se mueve la página de atrás.
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();

    function handleKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        closeCartDrawer();
        return;
      }
      if (event.key !== "Tab") return;

      // Trampa de foco: sin ella el tabulador se escapa al contenido de
      // atrás, que visualmente está tapado por el panel.
      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      restoreFocusTo.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const missingForFreeShipping = FREE_SHIPPING_FROM_CLP - subtotal;
  const isEmpty = lines.length === 0;

  return (
    <div className="fixed inset-0 z-200 flex justify-end">
      {/* Fondo: cierra al hacer clic. Es decorativo — la tecla Escape y el
          botón de cerrar cubren el mismo camino para quien usa teclado. */}
      <div className="absolute inset-0 bg-ink/60" onClick={closeCartDrawer} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Carrito de compras"
        className="animate-drawer-in relative flex h-full w-full flex-col border-l border-ink bg-cream sm:w-105"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-ink px-5 py-4">
          <h2 className="text-xl font-extrabold tracking-[-.02em] uppercase">
            Tu carrito <span className="font-mono text-[.7em] text-coral">({count})</span>
          </h2>
          <button
            type="button"
            data-autofocus
            aria-label="Cerrar el carrito"
            onClick={closeCartDrawer}
            className="cursor-pointer border border-ink bg-transparent px-2.5 py-1 text-sm leading-none transition-colors hover:bg-coral"
          >
            ✕
          </button>
        </header>

        {isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="font-mono text-[13px] text-muted">[ carrito vacío ]</p>
            <p className="text-lg font-extrabold">Todavía no agregas nada.</p>
            <a href="/tienda" className="btn-primary px-6 py-3 text-sm">
              Ir al catálogo →
            </a>
          </div>
        ) : (
          <>
            {/* Solo la lista scrollea: el resumen y el botón de pago quedan
                siempre a la vista, que es lo que se va a tocar. */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CartLines lines={lines} onNavigate={closeCartDrawer} />
            </div>

            <footer className="flex shrink-0 flex-col gap-2.5 border-t border-ink px-5 py-4">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span className="font-mono font-bold" data-testid="drawer-subtotal">
                  {formatCLP(subtotal)}
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span>Envío</span>
                <span className="font-mono font-bold">
                  {shipping === 0 ? "Gratis" : formatCLP(shipping)}
                </span>
              </div>

              <div className="flex justify-between border-t border-ink pt-2.5 text-base font-extrabold">
                <span>Total</span>
                <span className="font-mono" data-testid="drawer-total">
                  {formatCLP(total)}
                </span>
              </div>

              <p className="font-mono text-[11px] text-coral">
                {missingForFreeShipping > 0
                  ? `Te faltan ${formatCLP(missingForFreeShipping)} para envío gratis`
                  : "✓ Tienes envío gratis"}
              </p>

              <a href="/checkout" className="btn-primary px-5 py-3.5 text-sm">
                Ir al checkout →
              </a>

              <a
                href="/carrito"
                className="text-center font-mono text-[11px] text-muted underline underline-offset-4 hover:text-coral"
              >
                ver el carrito completo
              </a>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
