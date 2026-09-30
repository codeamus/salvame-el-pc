import { describe, expect, it } from "vitest";
import {
  isTheme,
  oppositeTheme,
  parseDurationMs,
  resolveTheme,
  THEME_COLOR,
  THEME_STORAGE_KEY,
  themeToggleLabel,
} from "@/lib/theme";

describe("isTheme", () => {
  it("acepta solo los dos temas reales", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
  });

  it("rechaza lo que pueda haber quedado en localStorage", () => {
    // El localStorage es del visitante: puede tener basura de una versión
    // anterior del sitio o algo escrito a mano desde las devtools.
    expect(isTheme("oscuro")).toBe(false);
    expect(isTheme("")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(isTheme(1)).toBe(false);
    expect(isTheme({ theme: "dark" })).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("sin nada guardado sigue al sistema", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });

  it("lo guardado le gana al sistema en las dos direcciones", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("un valor guardado inválido se trata como si no hubiera nada", () => {
    expect(resolveTheme("oscurito", true)).toBe("dark");
    expect(resolveTheme("", false)).toBe("light");
  });
});

describe("oppositeTheme", () => {
  it("alterna entre los dos", () => {
    expect(oppositeTheme("light")).toBe("dark");
    expect(oppositeTheme("dark")).toBe("light");
  });
});

describe("themeToggleLabel", () => {
  it("nombra el destino y no el estado actual", () => {
    expect(themeToggleLabel("light")).toBe("Cambiar a modo oscuro");
    expect(themeToggleLabel("dark")).toBe("Cambiar a modo claro");
  });
});

describe("parseDurationMs", () => {
  it("entiende milisegundos", () => {
    expect(parseDurationMs("260ms")).toBe(260);
    expect(parseDurationMs("  260ms  ")).toBe(260);
  });

  it("entiende segundos, que es como termina compilado el token", () => {
    // El build minifica `260ms` a `.26s`, así que esta rama no es teórica:
    // es exactamente lo que theme-ui.ts lee en producción.
    expect(parseDurationMs(".26s")).toBeCloseTo(260);
    expect(parseDurationMs("0.26s")).toBeCloseTo(260);
    expect(parseDurationMs("1s")).toBe(1000);
  });

  it("ante cualquier cosa rara devuelve 0 — se cambia sin fundido", () => {
    // Vale más un cambio brusco que un botón que se queda pegado esperando
    // una transición que nunca termina.
    expect(parseDurationMs("")).toBe(0);
    expect(parseDurationMs("auto")).toBe(0);
    expect(parseDurationMs("-1s")).toBe(0);
  });
});

describe("constantes", () => {
  it("la clave de localStorage va con el prefijo del sitio, como el carrito", () => {
    expect(THEME_STORAGE_KEY).toBe("salvameelpc:theme");
  });

  it("cada tema tiene su color de barra del navegador", () => {
    expect(THEME_COLOR.light).toBe("#F6F1E7");
    expect(THEME_COLOR.dark).toBe("#15120F");
  });
});
