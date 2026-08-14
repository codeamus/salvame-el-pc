import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

/**
 * Cada test arranca de cero: se desmonta el DOM y se limpia el localStorage.
 * Sin esto, el estado del carrito se filtra de un test a otro y aparecen
 * fallas fantasma que dependen del orden de ejecución.
 */
beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
