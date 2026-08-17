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

  test("las cards del catálogo agregan sin hidratar React", async ({ page }) => {
    // El catálogo no carga React: el botón lo maneja la delegación de
    // cart-ui.ts, que corre antes del evento load.
    await page.goto("/tienda");

    await page
      .getByRole("button", { name: "Agregar Mouse Redragon Cobra M711 al carrito" })
      .click();

    await expect(page.getByRole("status")).toContainText("Agregado: Mouse Redragon Cobra M711");
    await expect(page.locator("[data-cart-count]")).toHaveText("1");
  });

  test("el selector de la card agrega varias unidades de una vez", async ({ page }) => {
    await page.goto("/tienda");
    const card = page.locator("article").filter({ hasText: "Mouse Redragon Cobra M711" }).first();

    await card.getByRole("button", { name: /más unidades/i }).click();
    await card.getByRole("button", { name: /más unidades/i }).click();
    await expect(card.locator("[data-qty-value]")).toHaveText("3");

    await card.getByRole("button", { name: /agregar mouse redragon .* al carrito/i }).click();

    await expect(page.locator("[data-cart-count]")).toHaveText("3");
    // Vuelve a 1: si quedara en 3, el siguiente clic agregaría otras 3 sin
    // que el visitante lo haya pedido.
    await expect(card.locator("[data-qty-value]")).toHaveText("1");
  });

  test("el selector de la card nunca baja de 1", async ({ page }) => {
    await page.goto("/tienda");
    const card = page.locator("article").filter({ hasText: "Mouse Redragon Cobra M711" }).first();

    await card.getByRole("button", { name: /menos unidades/i }).click();
    await card.getByRole("button", { name: /menos unidades/i }).click();

    await expect(card.locator("[data-qty-value]")).toHaveText("1");
  });
});

test.describe("Panel lateral del carrito", () => {
  /** Agrega un producto y abre el panel desde el botón del header. */
  async function abrirPanel(page: Page) {
    await page.goto("/tienda");
    await page
      .getByRole("button", { name: "Agregar Mouse Redragon Cobra M711 al carrito" })
      .click();
    await expect(page.locator("[data-cart-count]")).toHaveText("1");

    await page.locator("[data-cart-open]").click();
    const panel = page.getByRole("dialog", { name: /carrito/i });
    await expect(panel).toBeVisible();
    return panel;
  }

  test("se abre sin salir de la página que estabas viendo", async ({ page }) => {
    await abrirPanel(page);

    // El botón es un <a href="/carrito">: si el panel no interceptara el clic
    // en fase de captura, el ClientRouter ya nos habría navegado.
    await expect(page).toHaveURL(/\/tienda/);
    await expect(page.getByTestId("drawer-total")).toHaveText("$23.980");
  });

  test("sumar y restar en el panel actualiza totales y contador en vivo", async ({ page }) => {
    const panel = await abrirPanel(page);

    await panel.getByRole("button", { name: /agregar una unidad de mouse/i }).click();
    await expect(page.getByTestId("drawer-subtotal")).toHaveText("$39.980");
    await expect(page.locator("[data-cart-count]")).toHaveText("2");

    await panel.getByRole("button", { name: /quitar una unidad de mouse/i }).click();
    await expect(page.getByTestId("drawer-subtotal")).toHaveText("$19.990");
    await expect(page.locator("[data-cart-count]")).toHaveText("1");
  });

  test("el ✕ del panel elimina el producto", async ({ page }) => {
    const panel = await abrirPanel(page);

    await panel.getByRole("button", { name: /quitar mouse redragon .* del carrito/i }).click();

    await expect(panel.getByText("Todavía no agregas nada.")).toBeVisible();
    await expect(page.locator("[data-cart-count]")).toHaveText("0");
  });

  test("se cierra con Escape y devuelve el foco al botón del carrito", async ({ page }) => {
    await page.goto("/tienda");
    await page
      .getByRole("button", { name: "Agregar Mouse Redragon Cobra M711 al carrito" })
      .click();

    // Se abre con el teclado a propósito: devolver el foco importa
    // justamente para quien navega así. Además, en WebKit un clic no enfoca
    // el enlace, así que abrir con el mouse dejaría el foco en el <body> y
    // el test mediría algo que no es el comportamiento real.
    const trigger = page.locator("[data-cart-open]");
    await trigger.focus();
    await page.keyboard.press("Enter");

    const panel = page.getByRole("dialog", { name: /carrito/i });
    await expect(panel).toBeVisible();

    // Se espera a que el foco entre al panel antes de seguir. Es un
    // requisito de accesibilidad por derecho propio, y además evita una
    // carrera: `toBeVisible` pasa apenas se pinta el panel, pero el efecto
    // que registra el listener de Escape corre un instante después, así que
    // mandar la tecla de inmediato la perdía.
    await expect(panel.getByRole("button", { name: /cerrar el carrito/i })).toBeFocused();

    await page.keyboard.press("Escape");

    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
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
