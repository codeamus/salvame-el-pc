import { describe, expect, it } from "vitest";
import {
  getDiscountPercent,
  isCategory,
  priceCLP,
  productViewTransitionName,
  type Product,
} from "@/types/product";

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
    specs: ["Sensor óptico 10.000 DPI"],
    ...overrides,
  };
}

describe("priceCLP", () => {
  it("acepta enteros >= 0", () => {
    expect(priceCLP(0)).toBe(0);
    expect(priceCLP(19990)).toBe(19990);
  });

  it("rechaza negativos", () => {
    expect(() => priceCLP(-1)).toThrow(RangeError);
  });

  it("rechaza decimales (CLP no usa centavos)", () => {
    expect(() => priceCLP(19990.5)).toThrow(RangeError);
  });
});

describe("isCategory", () => {
  it("reconoce las categorías del catálogo", () => {
    expect(isCategory("Mouse")).toBe(true);
    expect(isCategory("GPU")).toBe(true);
  });

  it("rechaza strings desconocidos", () => {
    expect(isCategory("Sillas")).toBe(false);
    expect(isCategory("")).toBe(false);
  });
});

describe("getDiscountPercent", () => {
  it("calcula el porcentaje redondeado", () => {
    const product = makeProduct({
      priceCLP: priceCLP(19990),
      compareAtPriceCLP: priceCLP(24990),
    });
    // (24990 - 19990) / 24990 = 20.008% → 20
    expect(getDiscountPercent(product)).toBe(20);
  });

  it("devuelve null si no hay precio anterior", () => {
    expect(getDiscountPercent(makeProduct())).toBeNull();
  });

  it("devuelve null si el precio anterior no es mayor (dato inconsistente)", () => {
    const product = makeProduct({
      priceCLP: priceCLP(19990),
      compareAtPriceCLP: priceCLP(19990),
    });
    expect(getDiscountPercent(product)).toBeNull();
  });
});

describe("productViewTransitionName", () => {
  it("genera un nombre único por producto", () => {
    expect(productViewTransitionName(makeProduct({ id: 7 }))).toBe("prod-7");
  });
});
