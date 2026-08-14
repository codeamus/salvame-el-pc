import { beforeEach, describe, expect, it } from "vitest";
import {
  $cart,
  $cartCount,
  $cartShipping,
  $cartSubtotal,
  $cartTotal,
  addToCart,
  clearCart,
  deserialize,
  FREE_SHIPPING_FROM_CLP,
  isCartLine,
  MAX_QUANTITY_PER_LINE,
  removeFromCart,
  SHIPPING_COST_CLP,
  shippingFor,
  updateQuantity,
  type CartLine,
} from "@/lib/cart-store";
import { priceCLP, type Product } from "@/types/product";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    slug: "mouse-redragon-cobra-m711",
    name: "Mouse Redragon Cobra M711",
    brand: "Redragon",
    category: "Mouse",
    priceCLP: priceCLP(19990),
    isFeatured: false,
    photo: "https://example.com/foto.jpg",
    photoCaption: "[ foto: mouse gamer rgb ]",
    specs: [],
    ...overrides,
  };
}

beforeEach(() => {
  clearCart();
});

describe("addToCart", () => {
  it("agrega una línea con los datos que muestra el carrito", () => {
    addToCart(makeProduct());

    expect($cart.get()).toEqual([
      {
        productId: 1,
        slug: "mouse-redragon-cobra-m711",
        name: "Mouse Redragon Cobra M711",
        brand: "Redragon",
        photo: "https://example.com/foto.jpg",
        priceCLP: 19990,
        quantity: 1,
      },
    ]);
  });

  it("suma cantidades si el producto ya estaba", () => {
    addToCart(makeProduct());
    addToCart(makeProduct(), 2);

    expect($cart.get()).toHaveLength(1);
    expect($cart.get()[0]?.quantity).toBe(3);
  });

  it("respeta el tope por línea", () => {
    addToCart(makeProduct(), MAX_QUANTITY_PER_LINE + 5);
    expect($cart.get()[0]?.quantity).toBe(MAX_QUANTITY_PER_LINE);
  });
});

describe("updateQuantity", () => {
  it("cambia la cantidad de la línea", () => {
    addToCart(makeProduct());
    updateQuantity(1, 4);
    expect($cart.get()[0]?.quantity).toBe(4);
  });

  it("elimina la línea si la cantidad baja de 1", () => {
    addToCart(makeProduct());
    updateQuantity(1, 0);
    expect($cart.get()).toEqual([]);
  });
});

describe("removeFromCart / clearCart", () => {
  it("quita solo la línea indicada", () => {
    addToCart(makeProduct());
    addToCart(makeProduct({ id: 2, slug: "otro" }));

    removeFromCart(1);

    expect($cart.get()).toHaveLength(1);
    expect($cart.get()[0]?.productId).toBe(2);
  });

  it("clearCart vacía todo", () => {
    addToCart(makeProduct());
    clearCart();
    expect($cart.get()).toEqual([]);
  });
});

describe("derivados", () => {
  it("cuenta unidades y calcula subtotal", () => {
    addToCart(makeProduct(), 2); // 39.980
    addToCart(makeProduct({ id: 2, slug: "otro", priceCLP: priceCLP(5000) })); // 5.000

    expect($cartCount.get()).toBe(3);
    expect($cartSubtotal.get()).toBe(44980);
  });

  it("cobra envío bajo el umbral y lo regala sobre él", () => {
    addToCart(makeProduct({ priceCLP: priceCLP(10000) }));
    expect($cartShipping.get()).toBe(SHIPPING_COST_CLP);
    expect($cartTotal.get()).toBe(10000 + SHIPPING_COST_CLP);

    updateQuantity(1, 5); // 50.000 — justo el umbral
    expect($cartShipping.get()).toBe(0);
    expect($cartTotal.get()).toBe(50000);
  });
});

describe("shippingFor", () => {
  it("carrito vacío no paga envío", () => {
    expect(shippingFor(0)).toBe(0);
  });

  it("bajo el umbral paga tarifa plana", () => {
    expect(shippingFor(FREE_SHIPPING_FROM_CLP - 1)).toBe(SHIPPING_COST_CLP);
  });

  it("desde el umbral es gratis", () => {
    expect(shippingFor(FREE_SHIPPING_FROM_CLP)).toBe(0);
  });
});

describe("deserialize", () => {
  const validLine: CartLine = {
    productId: 1,
    slug: "mouse-redragon-cobra-m711",
    name: "Mouse Redragon Cobra M711",
    brand: "Redragon",
    photo: "https://example.com/foto.jpg",
    priceCLP: priceCLP(19990),
    quantity: 1,
  };

  it("recupera un carrito válido", () => {
    expect(deserialize(JSON.stringify([validLine]))).toEqual([validLine]);
  });

  it("devuelve vacío con JSON roto", () => {
    expect(deserialize("{no es json")).toEqual([]);
  });

  it("devuelve vacío si no es un array", () => {
    expect(deserialize('{"cart": []}')).toEqual([]);
  });

  it("filtra líneas con forma inválida (datos de versiones anteriores)", () => {
    // La versión anterior del sitio guardaba productId como string y sin
    // marca/foto: esas líneas se descartan en vez de romper la UI.
    const legacyLine = { productId: "uuid-viejo", slug: "x", name: "X", priceCLP: 1, quantity: 1 };
    expect(deserialize(JSON.stringify([legacyLine, validLine]))).toEqual([validLine]);
  });

  it("isCartLine rechaza cantidades no positivas", () => {
    expect(isCartLine({ ...validLine, quantity: 0 })).toBe(false);
  });
});
