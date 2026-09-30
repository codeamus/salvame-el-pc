import { describe, expect, it } from "vitest";
import { CHILE_REGIONS, REGION_NAMES, communesOf, isCommuneOf, isRegion } from "@/lib/chile-geo";

describe("CHILE_REGIONS", () => {
  it("tiene las 16 regiones del país", () => {
    expect(CHILE_REGIONS).toHaveLength(16);
  });

  it("tiene las 346 comunas del país", () => {
    const total = CHILE_REGIONS.reduce((sum, region) => sum + region.communes.length, 0);
    expect(total).toBe(346);
  });

  it("empieza en el extremo norte y termina en el extremo sur", () => {
    expect(REGION_NAMES[0]).toBe("Arica y Parinacota");
    expect(REGION_NAMES.at(-1)).toBe("Magallanes y de la Antártica Chilena");
  });

  it("no repite nombres de región", () => {
    expect(new Set(REGION_NAMES).size).toBe(REGION_NAMES.length);
  });

  it("no repite comunas dentro de una misma región", () => {
    for (const region of CHILE_REGIONS) {
      expect(new Set(region.communes).size).toBe(region.communes.length);
    }
  });

  it("ninguna región queda sin comunas", () => {
    for (const region of CHILE_REGIONS) {
      expect(region.communes.length).toBeGreaterThan(0);
    }
  });
});

describe("communesOf", () => {
  it("devuelve las comunas de la región", () => {
    expect(communesOf("Metropolitana de Santiago")).toContain("Providencia");
    expect(communesOf("Valparaíso")).toContain("Viña del Mar");
    expect(communesOf("Los Lagos")).toContain("Puerto Montt");
  });

  it("devuelve vacío para una región inexistente o sin elegir", () => {
    expect(communesOf("")).toEqual([]);
    expect(communesOf("Región de la Fantasía")).toEqual([]);
  });
});

describe("isRegion", () => {
  it("reconoce las regiones reales y rechaza el resto", () => {
    expect(isRegion("Ñuble")).toBe(true);
    expect(isRegion("Otra región")).toBe(false);
    expect(isRegion("")).toBe(false);
  });
});

describe("isCommuneOf", () => {
  it("valida el par región/comuna, no la comuna sola", () => {
    expect(isCommuneOf("Metropolitana de Santiago", "Providencia")).toBe(true);
    // Providencia existe, pero no en Magallanes.
    expect(isCommuneOf("Magallanes y de la Antártica Chilena", "Providencia")).toBe(false);
  });

  it("rechaza comunas inventadas y regiones vacías", () => {
    expect(isCommuneOf("Metropolitana de Santiago", "Comuna Inventada")).toBe(false);
    expect(isCommuneOf("", "Providencia")).toBe(false);
  });
});
