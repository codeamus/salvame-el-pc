import { expect, test, type Page } from "@playwright/test";
import { waitForIslands } from "./helpers";

const PRODUCT_URL = "/producto/mouse-redragon-cobra-m711"; // $19.990

/** Abre la ficha y espera a que el island de compra quede utilizable. */
async function openProduct(page: Page): Promise<void> {
  await page.goto(PRODUCT_URL);
  await waitForIslands(page);
}

/** Abre el carrito. Su contenido real solo existe después de hidratar. */
async function openCart(page: Page): Promise<void> {
  await page.goto("/carrito");
  await waitForIslands(page);
}

test.describe("Flujo del carrito", () => {
  test("agregar desde la ficha muestra el toast y actualiza el contador", async ({ page }) => {
    await openProduct(page);

    await page.getByRole("button", { name: /agregar .* al carrito/i }).click();

    await expect(page.getByRole("status")).toContainText("Agregado: Mouse Redragon Cobra M711");
    await expect(page.locator("[data-cart-count]")).toHaveText("1");
  });

  test("el producto aparece en el carrito con subtotal, envío y total", async ({ page }) => {
    await openProduct(page);
    await page.getByRole("button", { name: /agregar .* al carrito/i }).click();

    await openCart(page);

    await expect(page.getByRole("link", { name: "Mouse Redragon Cobra M711" })).toBeVisible();
    // Se apunta a los testids porque el mismo monto aparece varias veces
    // (precio unitario, subtotal, total) y getByText fallaría por ambigüedad.
    await expect(page.getByTestId("cart-subtotal")).toHaveText("$19.990");
    await expect(page.getByTestId("cart-total")).toHaveText("$23.980"); // + $3.990 de envío
    await expect(page.getByText(/te faltan .* para envío gratis/i)).toBeVisible();
  });

  test("sobre $50.000 el envío pasa a ser gratis", async ({ page }) => {
    await openProduct(page);
    await page.getByRole("button", { name: /agregar .* al carrito/i }).click();
    await openCart(page);

    // 3 × $19.990 = $59.970 — cruza el umbral.
    const increment = page.getByRole("button", { name: /agregar una unidad/i });
    await increment.click();
    await increment.click();

    // exact: la barra promo y la nota coral también contienen "gratis".
    await expect(page.getByText("Gratis", { exact: true })).toBeVisible();
    await expect(page.getByText("✓ Tienes envío gratis")).toBeVisible();
    await expect(page.getByTestId("cart-total")).toHaveText("$59.970");
  });

  test("el carrito sobrevive a recargar la página", async ({ page }) => {
    await openProduct(page);
    await page.getByRole("button", { name: /agregar .* al carrito/i }).click();
    await expect(page.locator("[data-cart-count]")).toHaveText("1");

    await page.reload();
    await waitForIslands(page);

    await expect(page.locator("[data-cart-count]")).toHaveText("1");
  });

  test("el ✕ deja el carrito vacío", async ({ page }) => {
    await openProduct(page);
    await page.getByRole("button", { name: /agregar .* al carrito/i }).click();
    await openCart(page);

    await page.getByRole("button", { name: /quitar mouse redragon .* del carrito/i }).click();

    await expect(page.getByText("Todavía no agregas nada.")).toBeVisible();
  });

  test("el botón + de las cards estáticas también agrega", async ({ page }) => {
    // El catálogo no tiene islands: el botón "+" lo maneja la delegación de
    // cart-ui.ts, que corre antes del evento load.
    await page.goto("/tienda");

    await page
      .getByRole("button", { name: "Agregar Mouse Redragon Cobra M711 al carrito" })
      .click();

    await expect(page.getByRole("status")).toContainText("Agregado: Mouse Redragon Cobra M711");
    await expect(page.locator("[data-cart-count]")).toHaveText("1");
  });

  test("el checkout simula la salida a Mercado Pago y limpia el carrito", async ({ page }) => {
    await openProduct(page);
    await page.getByRole("button", { name: /agregar .* al carrito/i }).click();

    await page.goto("/checkout");
    await waitForIslands(page);

    await page.getByPlaceholder("Nombre y apellido").fill("Ada Lovelace");
    await page.getByPlaceholder("RUT (12.345.678-9)").fill("12.345.678-9");
    await page.getByPlaceholder("Correo electrónico").fill("ada@example.com");
    await page.getByPlaceholder("Teléfono (+56 9)").fill("+56 9 1234 5678");
    await page.getByRole("combobox").selectOption("Región Metropolitana");
    await page.getByPlaceholder("Comuna").fill("Providencia");
    await page.getByPlaceholder("Calle y número").fill("Av. Providencia 1234");

    await page.getByRole("button", { name: /pagar con mercado pago/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Serás redirigido para pagar $23.980");

    await dialog.getByRole("button", { name: "Volver a la tienda" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("[data-cart-count]")).toHaveText("0");
  });
});
