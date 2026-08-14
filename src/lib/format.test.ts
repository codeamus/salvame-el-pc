import { describe, expect, it } from "vitest";
import { formatCLP, formatNumber } from "@/lib/format";
import { priceCLP } from "@/types/product";

describe("formatCLP", () => {
  it("formatea con separador de miles chileno y sin decimales", () => {
    expect(formatCLP(priceCLP(45990))).toBe("$45.990");
  });

  it("formatea montos de millones", () => {
    expect(formatCLP(priceCLP(1250000))).toBe("$1.250.000");
  });

  it("formatea el cero", () => {
    expect(formatCLP(priceCLP(0))).toBe("$0");
  });

  it("no muestra decimales aunque reciba un número con coma", () => {
    expect(formatCLP(1990.6)).toBe("$1.991");
  });
});

describe("formatNumber", () => {
  it("usa punto como separador de miles", () => {
    expect(formatNumber(3200)).toBe("3.200");
  });
});
