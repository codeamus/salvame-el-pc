import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import CartView from "@/components/cart/CartView";
import { addToCart, clearCart } from "@/lib/cart-store";
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

describe("CartView", () => {
  it("muestra el estado vacío con CTA al catálogo", () => {
    render(<CartView />);

    expect(screen.getByText("Todavía no agregas nada.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ir al catálogo/i })).toHaveAttribute(
      "href",
      "/tienda",
    );
  });

  it("muestra la línea con subtotal, envío y total", () => {
    addToCart(makeProduct());
    render(<CartView />);

    expect(screen.getByRole("link", { name: "Mouse Redragon Cobra M711" })).toBeInTheDocument();
    expect(screen.getByText("$19.990 c/u")).toBeInTheDocument();
    expect(screen.getByTestId("cart-subtotal")).toHaveTextContent("$19.990");
    // Envío bajo el umbral: $3.990 → total $23.980.
    expect(screen.getByTestId("cart-total")).toHaveTextContent("$23.980");
    expect(screen.getByText("Te faltan $30.010 para envío gratis")).toBeInTheDocument();
  });

  it("regala el envío desde $50.000 y lo dice", () => {
    addToCart(makeProduct(), 3); // 59.970
    render(<CartView />);

    expect(screen.getByText("Gratis")).toBeInTheDocument();
    expect(screen.getByText("✓ Tienes envío gratis")).toBeInTheDocument();
    expect(screen.getByTestId("cart-total")).toHaveTextContent("$59.970");
  });

  it("el stepper suma unidades y recalcula", async () => {
    const user = userEvent.setup();
    addToCart(makeProduct());
    render(<CartView />);

    await user.click(screen.getByRole("button", { name: /agregar una unidad/i }));

    expect(screen.getByTestId("cart-subtotal")).toHaveTextContent("$39.980");
  });

  it("el stepper no baja de 1", async () => {
    const user = userEvent.setup();
    addToCart(makeProduct());
    render(<CartView />);

    await user.click(screen.getByRole("button", { name: /quitar una unidad/i }));

    // Sigue en 1 — para sacar el producto está el ✕.
    expect(screen.getByTestId("cart-subtotal")).toHaveTextContent("$19.990");
    expect(screen.getByRole("link", { name: "Mouse Redragon Cobra M711" })).toBeInTheDocument();
  });

  it("el ✕ elimina la línea", async () => {
    const user = userEvent.setup();
    addToCart(makeProduct());
    render(<CartView />);

    await user.click(screen.getByRole("button", { name: /quitar mouse redragon/i }));

    expect(screen.getByText("Todavía no agregas nada.")).toBeInTheDocument();
  });
});
