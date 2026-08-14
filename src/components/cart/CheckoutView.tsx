import { useState } from "react";
import { useStore } from "@nanostores/react";
import { $cart, $cartShipping, $cartTotal, clearCart } from "@/lib/cart-store";
import { formatCLP } from "@/lib/format";

const REGIONS = [
  "Región Metropolitana",
  "Valparaíso",
  "Biobío",
  "La Araucanía",
  "Coquimbo",
  "O'Higgins",
  "Maule",
  "Los Lagos",
  "Antofagasta",
  "Otra región",
];

/**
 * Checkout de despacho (paso 01) con salida a Mercado Pago (paso 02).
 *
 * HOY el pago está simulado con el modal del prototipo: el sitio es estático
 * y no hay backend. Para conectar Checkout Pro de verdad hay que pasar Astro
 * a output server y crear un endpoint /api/checkout que arme la preference
 * con los items y redirija a init_point — este componente solo cambia el
 * handleSubmit para hacer ese POST.
 */
export default function CheckoutView() {
  const lines = useStore($cart);
  const shipping = useStore($cartShipping);
  const total = useStore($cartTotal);
  const [paying, setPaying] = useState(false);

  if (lines.length === 0 && !paying) {
    return (
      <div className="px-5 pt-12 pb-18 sm:px-10">
        <h1 className="mb-8 text-[clamp(36px,5vw,64px)] font-extrabold tracking-[-.04em] uppercase">
          Checkout
        </h1>
        <div className="flex flex-col items-center gap-4.5 border border-ink p-14 text-center">
          <p className="font-mono text-[13px] text-muted">[ carrito vacío ]</p>
          <p className="text-[22px] font-extrabold">No hay nada que pagar todavía.</p>
          <a href="/tienda" className="btn-primary px-7 py-3.5">
            Ir al catálogo →
          </a>
        </div>
      </div>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setPaying(true);
  }

  function handleClose(): void {
    clearCart();
    window.location.href = "/";
  }

  return (
    <div className="px-5 pt-12 pb-18 sm:px-10">
      <h1 className="mb-2 text-[clamp(36px,5vw,64px)] font-extrabold tracking-[-.04em] uppercase">
        Checkout
      </h1>
      <p className="mb-8 font-mono text-xs text-muted">01 despacho → 02 pago en mercado pago</p>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1.5fr_1fr]"
      >
        <div className="flex flex-col gap-7">
          <fieldset className="m-0 flex flex-col gap-3.5 border border-ink p-6">
            <legend className="px-2 font-mono text-[11px] tracking-[.14em] uppercase">
              Contacto
            </legend>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <input required name="nombre" placeholder="Nombre y apellido" className="field" />
              <input required name="rut" placeholder="RUT (12.345.678-9)" className="field" />
              <input
                required
                name="correo"
                type="email"
                placeholder="Correo electrónico"
                className="field"
              />
              <input required name="telefono" placeholder="Teléfono (+56 9)" className="field" />
            </div>
          </fieldset>

          {/* Solo envío — no hay retiro en tienda (definición del handoff). */}
          <fieldset className="m-0 flex flex-col gap-3.5 border border-ink p-6">
            <legend className="px-2 font-mono text-[11px] tracking-[.14em] uppercase">
              Dirección de despacho
            </legend>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <select required name="region" defaultValue="" className="field">
                <option value="" disabled>
                  Región
                </option>
                {REGIONS.map((region) => (
                  <option key={region}>{region}</option>
                ))}
              </select>
              <input required name="comuna" placeholder="Comuna" className="field" />
            </div>
            <input required name="calle" placeholder="Calle y número" className="field" />
            <input
              name="referencia"
              placeholder="Depto / oficina / referencia (opcional)"
              className="field"
            />
          </fieldset>
        </div>

        <aside className="sticky top-22 flex flex-col gap-3.5 border border-ink p-7">
          <p className="font-mono text-[11px] tracking-[.14em] text-muted uppercase">Tu pedido</p>

          {lines.map((line) => (
            <div
              key={line.productId}
              className="flex justify-between gap-3 border-b border-line-soft pb-2.5 text-[13px]"
            >
              <span className="font-semibold">
                {line.name} <span className="font-mono text-muted">×{line.quantity}</span>
              </span>
              <span className="font-mono font-bold whitespace-nowrap">
                {formatCLP(line.priceCLP * line.quantity)}
              </span>
            </div>
          ))}

          <div className="flex justify-between text-sm">
            <span>Envío</span>
            <span className="font-mono font-bold">
              {shipping === 0 ? "Gratis" : formatCLP(shipping)}
            </span>
          </div>

          <div className="flex justify-between border-t border-ink pt-3.5 text-[17px] font-extrabold">
            <span>Total</span>
            <span className="font-mono">{formatCLP(total)}</span>
          </div>

          <button type="submit" className="btn-primary px-6 py-4">
            Pagar con Mercado Pago →
          </button>

          <p className="text-center font-mono text-[11px] text-muted">
            serás redirigido a mercado pago para completar el pago
          </p>
        </aside>
      </form>

      {/* Modal que simula la salida a Mercado Pago (igual al prototipo). */}
      {paying && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Redirección a Mercado Pago"
          className="fixed inset-0 z-200 flex items-center justify-center bg-ink/75 p-6"
        >
          <div className="flex max-w-110 flex-col items-center gap-4 border border-ink bg-cream px-12 py-11 text-center">
            <p className="font-mono text-[11px] tracking-[.14em] text-coral uppercase">
              conectando con mercado pago…
            </p>
            <p className="text-2xl font-extrabold tracking-[-.02em]">
              Serás redirigido para pagar {formatCLP(total)}
            </p>
            <p className="text-[13px] text-ink/65">
              En el sitio real, aquí se abre el checkout de Mercado Pago con tu pedido ya cargado.
            </p>
            <button type="button" onClick={handleClose} className="btn-secondary px-7 py-3 text-sm">
              Volver a la tienda
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
