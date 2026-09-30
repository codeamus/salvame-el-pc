import { expect, test, type Page } from "@playwright/test";
import {
  FAKE_INTENT_URL,
  envioPara,
  formatearCLP,
  leerMonto,
  leerReglasEnvio,
  productoDePrueba,
  stubOrderStatus,
  stubPaymentGateway,
  waitForIslands,
} from "./helpers";

/**
 * Abre la ficha y espera a que el island de compra quede utilizable.
 *
 * Qué producto es sale del catálogo vigente, no de un slug escrito acá:
 * ver el bloque "EL CATÁLOGO" en helpers.ts.
 */
async function openProduct(page: Page): Promise<void> {
  const producto = await productoDePrueba(page);
  await page.goto(producto.url);
  await waitForIslands(page);
}

/** La card del producto de prueba dentro del catálogo. */
async function cardDe(page: Page) {
  const producto = await productoDePrueba(page);
  await page.goto("/tienda");
  return page.locator("article").filter({ hasText: producto.nombre }).first();
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

    const producto = await productoDePrueba(page);
    await expect(page.getByRole("status")).toContainText(`Agregado: ${producto.nombre}`);
    await expect(page.locator("[data-cart-count]")).toHaveText("1");
  });

  test("el producto aparece en el carrito con subtotal, envío y total", async ({ page }) => {
    await openProduct(page);
    await page.getByRole("button", { name: /agregar .* al carrito/i }).click();

    await openCart(page);

    const producto = await productoDePrueba(page);
    await expect(page.getByRole("link", { name: producto.nombre })).toBeVisible();

    // Se apunta a los testids porque el mismo monto aparece varias veces
    // (precio unitario, subtotal, total) y getByText fallaría por ambigüedad.
    //
    // Los montos se leen y se comprueba la ARITMÉTICA: el precio viene del
    // panel y escribirlo acá haría fallar la suite el día que alguien lo
    // ajuste, sin que nada esté roto.
    const reglas = await leerReglasEnvio(page);
    const subtotal = await leerMonto(page, "cart-subtotal");

    expect(subtotal).toBeGreaterThan(0);
    expect(subtotal).toBeLessThan(reglas.freeShippingFromCLP);

    await expect(page.getByTestId("cart-total")).toHaveText(
      formatearCLP(subtotal + envioPara(subtotal, reglas)),
    );
    await expect(page.getByText(/te faltan .* para envío gratis/i)).toBeVisible();
  });

  test("sobre $50.000 el envío pasa a ser gratis", async ({ page }) => {
    await openProduct(page);
    await page.getByRole("button", { name: /agregar .* al carrito/i }).click();
    await openCart(page);

    const reglas = await leerReglasEnvio(page);
    const unitario = await leerMonto(page, "cart-subtotal");

    // Cuántas unidades hacen falta para cruzar el umbral, con el precio que
    // el producto tenga hoy.
    const necesarias = Math.ceil(reglas.freeShippingFromCLP / unitario);
    const increment = page.getByRole("button", { name: /agregar una unidad/i });
    for (let i = 1; i < necesarias; i += 1) await increment.click();

    // exact: la barra promo y la nota coral también contienen "gratis".
    await expect(page.getByText("Gratis", { exact: true })).toBeVisible();
    await expect(page.getByText("✓ Tienes envío gratis")).toBeVisible();
    await expect(page.getByTestId("cart-total")).toHaveText(formatearCLP(unitario * necesarias));
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

    const producto = await productoDePrueba(page);
    await page.getByRole("button", { name: `Quitar ${producto.nombre} del carrito` }).click();

    await expect(page.getByText("Todavía no agregas nada.")).toBeVisible();
  });

  test("las cards del catálogo agregan sin hidratar React", async ({ page }) => {
    // El catálogo no carga React: el botón lo maneja la delegación de
    // cart-ui.ts, que corre antes del evento load.
    const producto = await productoDePrueba(page);
    await page.goto("/tienda");
    await page.getByRole("button", { name: `Agregar ${producto.nombre} al carrito` }).click();

    await expect(page.getByRole("status")).toContainText(`Agregado: ${producto.nombre}`);
    await expect(page.locator("[data-cart-count]")).toHaveText("1");
  });

  test("el selector de la card agrega varias unidades de una vez", async ({ page }) => {
    const card = await cardDe(page);

    await card.getByRole("button", { name: /más unidades/i }).click();
    await card.getByRole("button", { name: /más unidades/i }).click();
    await expect(card.locator("[data-qty-value]")).toHaveText("3");

    await card.getByRole("button", { name: /^agregar .* al carrito$/i }).click();

    await expect(page.locator("[data-cart-count]")).toHaveText("3");
    // Vuelve a 1: si quedara en 3, el siguiente clic agregaría otras 3 sin
    // que el visitante lo haya pedido.
    await expect(card.locator("[data-qty-value]")).toHaveText("1");
  });

  test("el selector de la card nunca baja de 1", async ({ page }) => {
    const card = await cardDe(page);

    await card.getByRole("button", { name: /menos unidades/i }).click();
    await card.getByRole("button", { name: /menos unidades/i }).click();

    await expect(card.locator("[data-qty-value]")).toHaveText("1");
  });
});

test.describe("Panel lateral del carrito", () => {
  /** Agrega un producto y abre el panel desde el botón del header. */
  async function abrirPanel(page: Page) {
    const producto = await productoDePrueba(page);
    await page.goto("/tienda");
    await page.getByRole("button", { name: `Agregar ${producto.nombre} al carrito` }).click();
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

    const reglas = await leerReglasEnvio(page);
    const subtotal = await leerMonto(page, "drawer-subtotal");
    await expect(page.getByTestId("drawer-total")).toHaveText(
      formatearCLP(subtotal + envioPara(subtotal, reglas)),
    );
  });

  test("sumar y restar en el panel actualiza totales y contador en vivo", async ({ page }) => {
    const panel = await abrirPanel(page);

    const unitario = await leerMonto(page, "drawer-subtotal");

    const producto = await productoDePrueba(page);
    await panel.getByRole("button", { name: `Agregar una unidad de ${producto.nombre}` }).click();
    await expect(page.getByTestId("drawer-subtotal")).toHaveText(formatearCLP(unitario * 2));
    await expect(page.locator("[data-cart-count]")).toHaveText("2");

    await panel.getByRole("button", { name: `Quitar una unidad de ${producto.nombre}` }).click();
    await expect(page.getByTestId("drawer-subtotal")).toHaveText(formatearCLP(unitario));
    await expect(page.locator("[data-cart-count]")).toHaveText("1");
  });

  test("el ✕ del panel elimina el producto", async ({ page }) => {
    const panel = await abrirPanel(page);

    const producto = await productoDePrueba(page);
    await panel.getByRole("button", { name: `Quitar ${producto.nombre} del carrito` }).click();

    await expect(panel.getByText("Todavía no agregas nada.")).toBeVisible();
    await expect(page.locator("[data-cart-count]")).toHaveText("0");
  });

  test("se cierra con Escape y devuelve el foco al botón del carrito", async ({ page }) => {
    const producto = await productoDePrueba(page);
    await page.goto("/tienda");
    await page.getByRole("button", { name: `Agregar ${producto.nombre} al carrito` }).click();

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

  /** Deja un producto en el carrito y el checkout lleno y listo para pagar. */
  async function llenarCheckout(page: Page): Promise<void> {
    await openProduct(page);
    await page.getByRole("button", { name: /agregar .* al carrito/i }).click();

    await page.goto("/checkout");
    await waitForIslands(page);

    await page.getByLabel("Nombre y apellido", { exact: true }).fill("Ada Lovelace");
    await page.getByLabel("RUT", { exact: true }).fill("123456785");
    await page.getByLabel("Correo electrónico", { exact: true }).fill("ada@example.com");
    await page.getByLabel(/^Teléfono/).fill("957243741");
    await page.getByLabel("Región", { exact: true }).selectOption("Metropolitana de Santiago");
    await page.getByLabel("Comuna", { exact: true }).selectOption("Providencia");
    await page.getByLabel("Calle y número", { exact: true }).fill("Av. Providencia 1234");
  }

  test("al salir a la pasarela el carrito NO se vacía", async ({ page }) => {
    await llenarCheckout(page);
    await stubPaymentGateway(page);

    await page.getByRole("button", { name: /pagar con tuu/i }).click();
    await expect(page).toHaveURL(FAKE_INTENT_URL);

    // Quien cancela o a quien le rechazan la tarjeta tiene que volver y
    // encontrar sus cosas donde las dejó. Vaciar al redirigir pierde la venta.
    await page.goto("/carrito");
    await waitForIslands(page);
    await expect(page.locator("[data-cart-count]")).toHaveText("1");
  });

  test("el carrito se vacía solo cuando el pago queda confirmado", async ({ page }) => {
    await llenarCheckout(page);
    await stubPaymentGateway(page);
    await page.getByRole("button", { name: /pagar con tuu/i }).click();
    await expect(page).toHaveURL(FAKE_INTENT_URL);

    // De vuelta desde la pasarela. El estado real lo escribe el callback
    // firmado de TUU; esta página solo lo consulta.
    await stubOrderStatus(page, "completed");
    await page.goto("/pago/exito?ref=ORD-20260831-E2E00001");
    await waitForIslands(page);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(/gracias/i);
    await expect(page.locator("[data-cart-count]")).toHaveText("0");
  });

  test("un pago rechazado no vacía el carrito", async ({ page }) => {
    await llenarCheckout(page);
    await stubPaymentGateway(page);
    await page.getByRole("button", { name: /pagar con tuu/i }).click();
    await expect(page).toHaveURL(FAKE_INTENT_URL);

    await stubOrderStatus(page, "failed");
    await page.goto("/pago/exito?ref=ORD-20260831-E2E00001");
    await waitForIslands(page);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(/no se completó/i);
    await expect(page.locator("[data-cart-count]")).toHaveText("1");
  });
});
