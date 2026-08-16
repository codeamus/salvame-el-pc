import { removeFromCart, updateQuantity, type CartLine } from "@/lib/cart-store";
import { formatCLP } from "@/lib/format";

interface CartLinesProps {
  lines: readonly CartLine[];
  /** Cierra el panel al navegar a una ficha. En la página completa no aplica. */
  onNavigate?: () => void;
}

/**
 * Lista editable de líneas del carrito.
 *
 * La usan el panel lateral y la página /carrito. Está compartida a propósito:
 * son la misma funcionalidad y mantener dos copias garantiza que una se
 * quede atrás cuando cambien las reglas (el tope por línea, el formato del
 * precio, los textos accesibles).
 *
 * El layout es de una sola columna con la foto a la izquierda, así entra
 * igual de bien en los 420 px del panel que en el ancho de la página, sin
 * necesitar variantes.
 */
export default function CartLines({ lines, onNavigate }: CartLinesProps) {
  return (
    <ul className="divide-y divide-line-soft">
      {lines.map((line) => (
        <li key={line.productId} className="flex gap-3.5 p-4">
          <a
            href={`/producto/${line.slug}`}
            onClick={onNavigate}
            className="stripes relative h-14 w-18 shrink-0 overflow-hidden border border-ink"
            tabIndex={-1}
            aria-hidden="true"
          >
            <img
              src={line.photo}
              alt=""
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </a>

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] text-coral uppercase">{line.brand}</p>
                <a
                  href={`/producto/${line.slug}`}
                  onClick={onNavigate}
                  className="text-[14px] leading-snug font-bold no-underline hover:text-coral"
                >
                  {line.name}
                </a>
              </div>

              {/* El texto visible es solo "✕", así que el nombre accesible
                  carga el producto: quien recorre los botones con lector de
                  pantalla necesita saber cuál está quitando. */}
              <button
                type="button"
                aria-label={`Quitar ${line.name} del carrito`}
                onClick={() => {
                  removeFromCart(line.productId);
                }}
                className="-mt-1 shrink-0 cursor-pointer border-none bg-transparent p-1 text-lg leading-none text-muted-soft transition-colors hover:text-coral"
              >
                ✕
              </button>
            </div>

            <p className="font-mono text-[11px] text-muted">{formatCLP(line.priceCLP)} c/u</p>

            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="flex border border-ink">
                <button
                  type="button"
                  aria-label={`Quitar una unidad de ${line.name}`}
                  onClick={() => {
                    // Nunca baja de 1: para sacar el producto está el ✕.
                    updateQuantity(line.productId, Math.max(1, line.quantity - 1));
                  }}
                  className="h-8 w-8 cursor-pointer border-none bg-transparent text-[15px] leading-none transition-colors hover:bg-coral"
                >
                  −
                </button>
                <span className="flex w-9 items-center justify-center border-x border-ink font-mono text-[13px] font-bold">
                  {line.quantity}
                </span>
                <button
                  type="button"
                  aria-label={`Agregar una unidad de ${line.name}`}
                  onClick={() => {
                    updateQuantity(line.productId, line.quantity + 1);
                  }}
                  className="h-8 w-8 cursor-pointer border-none bg-transparent text-[15px] leading-none transition-colors hover:bg-coral"
                >
                  +
                </button>
              </div>

              <span className="font-mono text-[15px] font-bold">
                {formatCLP(line.priceCLP * line.quantity)}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
