import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Cobertura de la fase "próximamente".
 *
 * Lo importante acá no es solo que la portada se vea bien, sino que NINGUNA
 * otra ruta responda: el sitio completo está construido y no debe filtrarse
 * antes de tiempo.
 */

test("la portada muestra el mensaje de próximamente", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Próximamente · Sálvame el PC/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pronto");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("salvamos tu PC");
  await expect(page.getByText(/© \d{4} Sálvame el PC — Santiago, Chile/)).toBeVisible();
});

test("la portada no expone navegación al sitio todavía cerrado", async ({ page }) => {
  await page.goto("/");

  // Ningún enlace interno debe llevar a una ruta que no se publica.
  const rutasInternas = await page.evaluate(() =>
    [...document.querySelectorAll("a[href]")]
      .map((a) => a.getAttribute("href") ?? "")
      .filter((href) => href.startsWith("/")),
  );

  expect(rutasInternas.filter((href) => href !== "/")).toEqual([]);
});

const RUTAS_CERRADAS = [
  "/tienda",
  "/carrito",
  "/checkout",
  "/contacto",
  "/servicio-tecnico",
  "/producto/mouse-redragon-cobra-m711",
];

for (const ruta of RUTAS_CERRADAS) {
  test(`${ruta} no está publicada`, async ({ page }) => {
    const response = await page.goto(ruta);

    expect(response?.status()).toBe(404);
    // Y no filtra contenido: lo que se ve es la página de espera.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Todavía");
  });
}

test("la portada no tiene violaciones de accesibilidad", async ({ page }) => {
  await page.goto("/");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(["color-contrast"])
    .analyze();

  expect(results.violations).toEqual([]);
});
