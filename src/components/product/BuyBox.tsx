import { useState } from "react";
import { addToCart, MAX_QUANTITY_PER_LINE, type CartProduct } from "@/lib/cart-store";
import { showToast } from "@/lib/toast-store";
import { formatCLP } from "@/lib/format";

interface BuyBoxProps {
  /**
   * CartProduct y no Product entero: Astro serializa los props del island
   * dentro del HTML de la ficha, así que pasar el objeto completo mandaría
   * también las specs y la descripción — duplicadas, porque ya se renderizan
   * en el servidor. Acá viaja solo lo que el carrito necesita guardar.
   */
  product: CartProduct;
}

/**
 * Stepper de cantidad + "Agregar al carrito" de la ficha de producto.
 * Es el único pedazo con estado de la página, por eso es island.
 */
export default function BuyBox({ product }: BuyBoxProps) {
  const [quantity, setQuantity] = useState(1);

  function decrement(): void {
    // El stepper nunca baja de 1 (regla del handoff): eliminar es con ✕ en el carrito.
    setQuantity((current) => Math.max(1, current - 1));
  }

  function increment(): void {
    setQuantity((current) => Math.min(MAX_QUANTITY_PER_LINE, current + 1));
  }

  function handleAdd(): void {
    addToCart(product, quantity);
    showToast(`Agregado: ${product.name}`);
  }

  return (
    <div className="mt-1.5 flex items-stretch gap-3.5">
      <div className="flex border border-line">
        <button
          type="button"
          onClick={decrement}
          aria-label="Quitar una unidad"
          className="w-11 cursor-pointer border-none bg-transparent text-lg transition-colors hover:bg-coral hover:text-on-coral"
        >
          −
        </button>
        <span
          aria-label={`Cantidad: ${quantity}`}
          className="flex w-12 items-center justify-center border-x border-line font-mono font-bold"
        >
          {quantity}
        </span>
        <button
          type="button"
          onClick={increment}
          aria-label="Agregar una unidad"
          className="w-11 cursor-pointer border-none bg-transparent text-lg transition-colors hover:bg-coral hover:text-on-coral"
        >
          +
        </button>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="btn-primary flex-1 px-6 py-3.5"
        aria-label={`Agregar ${product.name} al carrito por ${formatCLP(product.priceCLP * quantity)}`}
      >
        Agregar al carrito
      </button>
    </div>
  );
}
