import { useStore } from "@nanostores/react";
import CartLines from "@/components/cart/CartLines";
import {
  $cart,
  $cartCount,
  $cartShipping,
  $cartSubtotal,
  $cartTotal,
  FREE_SHIPPING_FROM_CLP,
} from "@/lib/cart-store";
import { formatCLP } from "@/lib/format";

export default function CartView() {
  const lines = useStore($cart);
  const count = useStore($cartCount);
  const subtotal = useStore($cartSubtotal);
  const shipping = useStore($cartShipping);
  const total = useStore($cartTotal);

  const missingForFreeShipping = FREE_SHIPPING_FROM_CLP - subtotal;

  return (
    <div className="px-5 pt-12 pb-18 sm:px-10">
      <h1 className="mb-8 text-[clamp(36px,5vw,64px)] font-extrabold tracking-[-.04em] uppercase">
        Tu carrito <span className="font-mono text-[.5em] font-bold text-coral">({count})</span>
      </h1>

      {lines.length === 0 ? (
        <div className="flex flex-col items-center gap-4.5 border border-ink p-14 text-center">
          <p className="font-mono text-[13px] text-muted">[ carrito vacío ]</p>
          <p className="text-[22px] font-extrabold">Todavía no agregas nada.</p>
          <a href="/tienda" className="btn-primary px-7 py-3.5">
            Ir al catálogo →
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1.6fr_1fr]">
          {/* Misma lista que el panel lateral: ver CartLines. */}
          <div className="border border-ink">
            <CartLines lines={lines} />
          </div>

          <aside className="sticky top-22 flex flex-col gap-3.5 border border-ink p-7">
            <p className="font-mono text-[11px] tracking-[.14em] text-muted uppercase">Resumen</p>

            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span className="font-mono font-bold" data-testid="cart-subtotal">
                {formatCLP(subtotal)}
              </span>
            </div>

            <div className="flex justify-between text-sm">
              <span>Envío</span>
              <span className="font-mono font-bold">
                {shipping === 0 ? "Gratis" : formatCLP(shipping)}
              </span>
            </div>

            <div className="flex justify-between border-t border-ink pt-3.5 text-[17px] font-extrabold">
              <span>Total</span>
              <span className="font-mono" data-testid="cart-total">
                {formatCLP(total)}
              </span>
            </div>

            <p className="font-mono text-[11px] text-coral">
              {missingForFreeShipping > 0
                ? `Te faltan ${formatCLP(missingForFreeShipping)} para envío gratis`
                : "✓ Tienes envío gratis"}
            </p>

            <a href="/checkout" className="btn-primary px-6 py-3.75">
              Ir al checkout →
            </a>

            <p className="text-center font-mono text-[11px] text-muted">
              pago seguro vía mercado pago
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
