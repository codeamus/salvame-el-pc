import { describe, expect, it } from "vitest";
import { cn } from "@/lib/cn";

describe("cn", () => {
  it("une clases simples", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2");
  });

  it("resuelve conflictos de Tailwind quedándose con la última", () => {
    expect(cn("px-4", "px-6")).toBe("px-6");
  });

  it("descarta valores falsy", () => {
    expect(cn("px-4", false, undefined, null, "py-2")).toBe("px-4 py-2");
  });

  it("soporta clases condicionales", () => {
    const isActive = true;
    expect(cn("base", isActive && "activo")).toBe("base activo");
  });

  it("devuelve string vacío sin argumentos", () => {
    expect(cn()).toBe("");
  });
});
