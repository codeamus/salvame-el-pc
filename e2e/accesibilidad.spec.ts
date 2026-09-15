import { expect, test } from "@playwright/test";
import { auditor, congelarAnimaciones, productoDePrueba, waitForIslands } from "./helpers";

/**
 * Auditoría automática de accesibilidad con axe-core.
 *
 * Cubre WCAG 2.1 niveles A y AA. Vale aclarar: axe detecta cerca del 30-40%
 * de los problemas reales de accesibilidad — que estos tests pasen NO
 * significa que el sitio sea accesible, significa que no tiene errores
 * obvios de los que una máquina puede detectar. La revisión con teclado y
 * lector de pantalla sigue siendo necesaria.
 *
 * Qué se excluye y por qué está en `auditor()`, en helpers.ts.
 */

const PAGES: readonly { name: string; path: string }[] = [
  { name: "portada", path: "/" },
  { name: "catálogo", path: "/tienda" },
  { name: "servicio técnico", path: "/servicio-tecnico" },
  { name: "contacto", path: "/contacto" },
  { name: "carrito vacío", path: "/carrito" },
  { name: "404", path: "/pagina-inexistente" },
];

for (const { name, path } of PAGES) {
  test(`la página de ${name} no tiene violaciones de accesibilidad`, async ({ page }) => {
    await page.goto(path);
    // Se audita el DOM ya hidratado: antes de eso, /carrito muestra el
    // estado vacío del servidor y no lo que ve realmente el visitante.
    await waitForIslands(page);
    await congelarAnimaciones(page);

    const results = await auditor(page, { contraste: false }).analyze();

    expect(results.violations).toEqual([]);
  });
}

// La ficha va aparte porque su URL sale del catálogo. Cuando estaba en la
// lista de arriba con un slug escrito a mano, el día que ese producto dejó
// de existir el test siguió pasando: auditaba el 404.
test("la ficha de producto no tiene violaciones de accesibilidad", async ({ page }) => {
  const producto = await productoDePrueba(page);
  await page.goto(producto.url);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(producto.nombre);
  await waitForIslands(page);
  await congelarAnimaciones(page);

  const results = await auditor(page, { contraste: false }).analyze();

  expect(results.violations).toEqual([]);
});

test("el panel lateral del carrito tampoco tiene violaciones", async ({ page }) => {
  const producto = await productoDePrueba(page);
  await page.goto("/tienda");
  await page.getByRole("button", { name: `Agregar ${producto.nombre} al carrito` }).click();
  await page.locator("[data-cart-open]").click();
  await expect(page.getByRole("dialog", { name: /carrito/i })).toBeVisible();

  const results = await auditor(page, { contraste: false }).analyze();

  expect(results.violations).toEqual([]);
});

test("el carrito con productos tampoco tiene violaciones", async ({ page }) => {
  const producto = await productoDePrueba(page);
  await page.goto(producto.url);
  await waitForIslands(page);
  await page.getByRole("button", { name: /agregar .* al carrito/i }).click();
  await page.goto("/carrito");
  await waitForIslands(page);
  await congelarAnimaciones(page);

  const results = await auditor(page, { contraste: false }).analyze();

  expect(results.violations).toEqual([]);
});
