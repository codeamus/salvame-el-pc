import { describe, expect, it, vi } from "vitest";
import { describeQuote, quoteOrder } from "@/lib/orders/quote";
import { FREE_SHIPPING_FROM_CLP, SHIPPING_COST_CLP } from "@/lib/order-rules";
import { priceCLP, type Product } from "@/types/product";

/**
 * Catálogo fijo, sustituyendo a la capa de datos.
 *
 * Estos tests prueban la ARITMÉTICA de la cotización —que el precio salga
 * del servidor y no del navegador, que el envío cruce bien el umbral— y eso
 * no debería depender de que exista una base ni de que alguien cambie un
 * precio desde el panel. Cuando el catálogo vivía en un JSON del repo daba
 * lo mismo; ahora sale de Supabase, así que se reemplaza acá.
 *
 * Los precios son los mismos de siempre para no reescribir las expectativas.
 */
function producto(id: number, nombre: string, precio: number): Product {
  return {
    id,
    slug: `producto-${String(id)}`,
    name: nombre,
    brand: "Marca",
    category: "Mouse",
    priceCLP: priceCLP(precio),
    isFeatured: false,
    photo: "",
    photoCaption: "",
    specs: [],
  };
}

const CATALOGO = [
  producto(1, "Mouse Redragon Cobra M711", 19990),
  producto(2, "Mouse Logitech G502 Hero", 44990),
  // Los nombres largos son parte del test: `describeQuote` tiene que caber
  // en el campo de descripción de TUU, y con nombres cortos nunca se
  // alcanzaría el límite que se está comprobando.
  producto(3, "Teclado Redragon Kumara K552 RGB", 29990),
  producto(4, "Teclado Logitech G413 TKL SE", 54990),
  producto(5, "RAM Kingston Fury Beast 16GB DDR5 5200", 54990),
];

vi.mock("@/data/products", () => ({
  getProductById: (id: number) => Promise.resolve(CATALOGO.find((p) => p.id === id) ?? null),
}));

const MOUSE_BARATO = { id: 1, quantity: 1 };

async function cotizar(items: unknown, entrega: "despacho" | "acordar" = "despacho") {
  return quoteOrder(items, entrega);
}

describe("quoteOrder", () => {
  it("lee el precio del catálogo del servidor", async () => {
    const resultado = await cotizar([MOUSE_BARATO]);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.quote.lines[0]?.unitPriceCLP).toBe(19990);
    expect(resultado.quote.subtotalCLP).toBe(19990);
  });

  it("IGNORA el precio que mande el navegador", async () => {
    // Esto es lo que impide pagar $1 por una GPU: el precio del payload no
    // se mira nunca, el monto sale del catálogo.
    const resultado = await cotizar([{ id: 1, quantity: 1, price: 1, priceCLP: 1 }]);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.quote.subtotalCLP).toBe(19990);
  });

  it("multiplica por la cantidad", async () => {
    const resultado = await cotizar([{ id: 1, quantity: 2 }]);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.quote.subtotalCLP).toBe(39980);
  });

  it("suma varias líneas", async () => {
    const resultado = await cotizar([
      { id: 1, quantity: 1 },
      { id: 2, quantity: 1 },
    ]);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.quote.subtotalCLP).toBe(19990 + 44990);
  });

  describe("envío", () => {
    it("cobra el envío bajo el umbral", async () => {
      const resultado = await cotizar([MOUSE_BARATO]);

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      expect(resultado.quote.shippingCLP).toBe(SHIPPING_COST_CLP);
      expect(resultado.quote.totalCLP).toBe(19990 + SHIPPING_COST_CLP);
    });

    it("no cobra envío sobre el umbral", async () => {
      const resultado = await cotizar([{ id: 2, quantity: 2 }]); // $89.980

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      expect(resultado.quote.subtotalCLP).toBeGreaterThanOrEqual(FREE_SHIPPING_FROM_CLP);
      expect(resultado.quote.shippingCLP).toBe(0);
    });

    it("con entrega a acordar no cobra envío", async () => {
      const resultado = await cotizar([MOUSE_BARATO], "acordar");

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      expect(resultado.quote.shippingCLP).toBe(0);
      expect(resultado.quote.totalCLP).toBe(19990);
    });
  });

  describe("rechazos", () => {
    it("rechaza el carrito vacío", async () => {
      const resultado = await cotizar([]);

      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.error).toMatch(/vacío/i);
    });

    it("rechaza algo que no es un arreglo", async () => {
      expect((await cotizar("hola")).ok).toBe(false);
      expect((await cotizar(null)).ok).toBe(false);
    });

    it("rechaza un producto que no existe", async () => {
      const resultado = await cotizar([{ id: 99999, quantity: 1 }]);

      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.error).toMatch(/disponible/i);
    });

    it("rechaza cantidad cero o negativa", async () => {
      expect((await cotizar([{ id: 1, quantity: 0 }])).ok).toBe(false);
      expect((await cotizar([{ id: 1, quantity: -3 }])).ok).toBe(false);
    });

    it("rechaza cantidades sobre el tope por línea", async () => {
      expect((await cotizar([{ id: 1, quantity: 999 }])).ok).toBe(false);
    });

    it("rechaza cantidades con decimales", async () => {
      expect((await cotizar([{ id: 1, quantity: 1.5 }])).ok).toBe(false);
    });

    it("rechaza el mismo producto repetido en dos líneas", async () => {
      // Duplicar la línea cobraría el doble sin que se note en el resumen.
      const resultado = await cotizar([
        { id: 1, quantity: 1 },
        { id: 1, quantity: 1 },
      ]);

      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.error).toMatch(/repetido/i);
    });

    it("rechaza un carrito absurdamente largo", async () => {
      const items = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, quantity: 1 }));

      expect((await cotizar(items)).ok).toBe(false);
    });
  });

  it("el total siempre es un entero CLP, como exige TUU", async () => {
    const resultado = await cotizar([{ id: 1, quantity: 3 }]);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(Number.isInteger(resultado.quote.totalCLP)).toBe(true);
  });
});

describe("describeQuote", () => {
  it("arma la descripción que ve el comprador en la pasarela", async () => {
    const resultado = await cotizar([{ id: 1, quantity: 2 }]);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(describeQuote(resultado.quote)).toBe("2x Mouse Redragon Cobra M711");
  });

  it("no se pasa del largo que acepta el campo", async () => {
    const resultado = await cotizar([
      { id: 1, quantity: 1 },
      { id: 2, quantity: 1 },
      { id: 3, quantity: 1 },
      { id: 4, quantity: 1 },
      { id: 5, quantity: 1 },
    ]);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(describeQuote(resultado.quote).length).toBeLessThanOrEqual(120);
  });
});
