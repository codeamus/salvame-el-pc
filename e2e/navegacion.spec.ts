import { expect, test } from "@playwright/test";

test.describe("Navegación del sitio", () => {
  test("la portada carga con el título y el hero", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Sálvame el PC/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Hardware y periféricos");
  });

  test("se puede ir de la portada al catálogo", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Ver catálogo →" }).first().click();

    await expect(page).toHaveURL(/\/tienda/);
    await expect(page.getByRole("heading", { level: 1, name: "Catálogo" })).toBeVisible();
  });

  test("se puede entrar a la ficha de un producto desde el catálogo", async ({ page }) => {
    await page.goto("/tienda");

    await page.getByRole("link", { name: "Mouse Redragon Cobra M711" }).click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mouse Redragon Cobra M711");
    await expect(page.getByText("Sensor óptico 10.000 DPI ajustable")).toBeVisible();
  });

  test("el filtro de categoría llega por query param (tiles del bento)", async ({ page }) => {
    await page.goto("/tienda?cat=Mouse");

    await expect(page.getByRole("heading", { level: 1, name: "Mouse" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mouse Redragon Cobra M711" })).toBeVisible();
    // Un producto de otra categoría queda oculto.
    await expect(page.getByRole("link", { name: "GPU GeForce RTX 4060 8GB" })).toBeHidden();
  });

  test("filtrar por categoría actualiza la URL y el contador", async ({ page }) => {
    await page.goto("/tienda");

    await page.getByRole("button", { name: "Teclados", exact: true }).click();

    await expect(page).toHaveURL(/cat=Teclados/);
    await expect(page.getByRole("heading", { level: 1, name: "Teclados" })).toBeVisible();
  });

  test("una URL inexistente muestra la página 404", async ({ page }) => {
    const response = await page.goto("/producto-que-no-existe");

    expect(response?.status()).toBe(404);
    await expect(page.getByText("[ error 404 ]")).toBeVisible();
  });

  test("el overlay clickeable de las tarjetas no se sale de su tarjeta", async ({ page }) => {
    // Regresión: el enlace del nombre usa `after:absolute after:inset-0` para
    // hacer clickeable toda la tarjeta. Si la tarjeta pierde `position:
    // relative`, ese overlay se estira hasta cubrir la página entera y
    // bloquea todos los demás links. Se verifica pidiéndole al navegador qué
    // elemento hay realmente en el centro del CTA del hero.
    await page.goto("/");

    const elementAtButtonCenter = await page.evaluate(() => {
      const button = [...document.querySelectorAll("a")].find(
        (anchor) => anchor.textContent?.trim() === "Ver catálogo →",
      );
      if (!button) return "no se encontró el botón";

      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit?.textContent?.trim() ?? "";
    });

    expect(elementAtButtonCenter).toBe("Ver catálogo →");
  });

  test("el enlace de salto al contenido funciona con teclado", async ({ page, browserName }) => {
    // WebKit/Safari no mueve el foco a los links con Tab por defecto
    // (preferencia del sistema): el test no aplica en ese engine.
    test.skip(browserName === "webkit", "Safari no tabula sobre links por defecto");

    await page.goto("/");

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Saltar al contenido" });
    await expect(skipLink).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#contenido/);
  });
});
