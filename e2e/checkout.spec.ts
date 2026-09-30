import { expect, test, type Page } from "@playwright/test";
import {
  FAKE_INTENT_URL,
  auditor,
  envioPara,
  formatearCLP,
  leerMonto,
  leerReglasEnvio,
  productoDePrueba,
  type ProductoDelCatalogo,
  stubPaymentGateway,
  waitForIslands,
} from "./helpers";

/**
 * Deja un producto en el carrito y abre el checkout ya hidratado.
 *
 * Devuelve el producto porque alguna prueba necesita saber CUÁL fue: sale
 * del catálogo vigente, no de un slug escrito acá (ver helpers.ts).
 */
async function openCheckout(page: Page): Promise<ProductoDelCatalogo> {
  const producto = await productoDePrueba(page);
  await page.goto(producto.url);
  await waitForIslands(page);
  await page.getByRole("button", { name: /agregar .* al carrito/i }).click();

  await page.goto("/checkout");
  await waitForIslands(page);
  return producto;
}

/** Llena el formulario con datos válidos. Los overrides rompen un campo. */
async function fillCheckout(
  page: Page,
  overrides: Partial<Record<"rut" | "telefono" | "region" | "comuna", string>> = {},
): Promise<void> {
  await page.getByLabel("Nombre y apellido", { exact: true }).fill("Ana Soto");
  await page.getByLabel("RUT", { exact: true }).fill(overrides.rut ?? "123456785");
  await page.getByLabel("Correo electrónico", { exact: true }).fill("ana@gmail.com");
  await page.getByLabel(/^Teléfono/).fill(overrides.telefono ?? "957243741");
  await page
    .getByLabel("Región", { exact: true })
    .selectOption(overrides.region ?? "Metropolitana de Santiago");
  await page.getByLabel("Comuna", { exact: true }).selectOption(overrides.comuna ?? "Providencia");
  await page.getByLabel("Calle y número", { exact: true }).fill("Av. Providencia 1234");
}

test.describe("Checkout", () => {
  test("no deja pagar con el formulario vacío", async ({ page }) => {
    await openCheckout(page);

    await page.getByRole("button", { name: /pagar con tuu/i }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("checkout-form-status")).toContainText("revisa 7 campos");
    await expect(page.getByLabel("Nombre y apellido", { exact: true })).toBeFocused();
  });

  test("el RUT se formatea solo y rechaza un dígito verificador falso", async ({ page }) => {
    await openCheckout(page);

    const rut = page.getByLabel("RUT", { exact: true });
    await rut.fill("123456789");
    await rut.blur();

    await expect(rut).toHaveValue("12.345.678-9");
    await expect(page.getByTestId("error-rut")).toContainText("dígito verificador");

    await rut.fill("123456785");
    await expect(page.getByTestId("error-rut")).toHaveCount(0);
  });

  test("el teléfono se formatea y rechaza letras", async ({ page }) => {
    await openCheckout(page);

    const phone = page.getByLabel(/^Teléfono/);
    await phone.fill("telefono");
    await phone.blur();

    await expect(phone).toHaveValue("");
    await expect(page.getByTestId("error-telefono")).toBeVisible();

    await phone.fill("957243741");
    await expect(phone).toHaveValue("9 5724 3741");
    await expect(page.getByTestId("error-telefono")).toHaveCount(0);
  });

  test("las comunas se cargan según la región elegida", async ({ page }) => {
    await openCheckout(page);

    const comuna = page.getByLabel("Comuna", { exact: true });
    await expect(comuna).toBeDisabled();

    await page.getByLabel("Región", { exact: true }).selectOption("Valparaíso");
    await expect(comuna).toBeEnabled();
    await expect(comuna.locator("option", { hasText: "Viña del Mar" })).toHaveCount(1);
    await expect(comuna.locator("option", { hasText: /^Providencia$/ })).toHaveCount(0);

    // Cambiar de región limpia la comuna: no puede quedar un par imposible.
    await comuna.selectOption("Viña del Mar");
    await page.getByLabel("Región", { exact: true }).selectOption("Los Lagos");
    await expect(comuna).toHaveValue("");
    await expect(comuna.locator("option", { hasText: "Puerto Montt" })).toHaveCount(1);
  });

  test("acordar entrega esconde la dirección y no cobra envío", async ({ page }) => {
    await openCheckout(page);

    // El checkout no expone el subtotal, así que se deriva: total − envío.
    // Lo que se comprueba es la relación entre los tres montos, que es lo que
    // puede romperse; el precio concreto lo administra el panel.
    // El checkout no expone el subtotal, así que se deriva: total − envío.
    // Lo que se comprueba es la relación entre los tres montos, que es lo que
    // puede romperse; el precio concreto lo administra el panel.
    const reglas = await leerReglasEnvio(page);
    const envio = await leerMonto(page, "checkout-shipping");
    const totalConEnvio = await leerMonto(page, "checkout-total");
    const subtotal = totalConEnvio - envio;

    expect(envio).toBe(envioPara(subtotal, reglas));

    await page.getByTestId("entrega-acordar").click();

    await expect(page.getByRole("radio", { name: /acordar entrega/i })).toBeChecked();
    await expect(page.getByLabel("Región", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Calle y número", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("acordar-entrega-nota")).toBeVisible();
    // Coordinar la entrega no cobra despacho: el total baja exactamente al
    // subtotal, sin importar cuánto costaran los productos.
    await expect(page.getByTestId("checkout-shipping")).toHaveText("A convenir");
    await expect(page.getByTestId("checkout-total")).toHaveText(formatearCLP(subtotal));
  });

  test("con entrega a acordar basta el contacto para pagar", async ({ page }) => {
    await openCheckout(page);

    await page.getByTestId("entrega-acordar").click();
    await page.getByLabel("Nombre y apellido", { exact: true }).fill("Ana Soto");
    await page.getByLabel("RUT", { exact: true }).fill("123456785");
    await page.getByLabel("Correo electrónico", { exact: true }).fill("ana@gmail.com");
    await page.getByLabel(/^Teléfono/).fill("957243741");

    const requests = await stubPaymentGateway(page);
    await page.getByRole("button", { name: /pagar con tuu/i }).click();

    await expect(page).toHaveURL(FAKE_INTENT_URL);

    // Sin despacho no hay dirección que mandar, y el envío no se cobra.
    expect(requests).toHaveLength(1);
    expect(requests[0]?.cliente.entrega).toBe("acordar");
    expect(requests[0]?.cliente.direccion).toBeNull();
  });

  test("se puede elegir la forma de entrega solo con el teclado", async ({ page }) => {
    await openCheckout(page);

    await page.getByRole("radio", { name: /despacho a domicilio/i }).focus();
    await page.keyboard.press("ArrowRight");

    await expect(page.getByRole("radio", { name: /acordar entrega/i })).toBeChecked();
    await expect(page.getByTestId("acordar-entrega-nota")).toBeVisible();
  });

  test("con todos los datos válidos redirige a la pasarela", async ({ page }) => {
    const producto = await openCheckout(page);
    const requests = await stubPaymentGateway(page);
    await fillCheckout(page);

    await page.getByRole("button", { name: /pagar con tuu/i }).click();

    // Redirección top-level, no un popup: un bloqueador mataría el popup.
    await expect(page).toHaveURL(FAKE_INTENT_URL);

    // Lo que se manda al servidor son ids y cantidades. El precio se
    // recalcula allá: si viajara desde el navegador, se podría editar.
    expect(requests).toHaveLength(1);
    expect(requests[0]?.items).toEqual([{ id: producto.id, quantity: 1 }]);
    expect(JSON.stringify(requests[0]?.items)).not.toContain(String(producto.precio));
    expect(requests[0]?.cliente.telefono).toBe("+56957243741");
  });

  test("un doble clic en pagar abre un solo intento de pago", async ({ page }) => {
    await openCheckout(page);
    await fillCheckout(page);

    // La respuesta se demora a propósito: es la ventana en la que un
    // comprador impaciente vuelve a hacer clic y termina pagando dos veces.
    const requests: unknown[] = [];
    await page.route("**/api/checkout", async (route) => {
      requests.push(route.request().postData());
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ redirectUrl: FAKE_INTENT_URL, reference: "ORD-DOBLE" }),
      });
    });
    await page.route("https://payment.haulmer.dev/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" });
    });

    const boton = page.getByTestId("checkout-submit");
    await boton.click();
    await expect(boton).toBeDisabled();
    await boton.click({ force: true });

    await expect(page).toHaveURL(FAKE_INTENT_URL);
    expect(requests).toHaveLength(1);
  });

  test("el checkout con el formulario en error no tiene violaciones de accesibilidad", async ({
    page,
  }) => {
    await openCheckout(page);
    await page.getByRole("button", { name: /pagar con tuu/i }).click();
    await expect(page.getByTestId("error-nombre")).toBeVisible();

    const conDespacho = await auditor(page, { contraste: false }).analyze();

    expect(conDespacho.violations).toEqual([]);

    // La otra forma de entrega cambia medio formulario, así que se audita
    // también: es una vista distinta, no un detalle de la misma.
    await page.getByTestId("entrega-acordar").click();
    await expect(page.getByTestId("acordar-entrega-nota")).toBeVisible();

    const conAcordar = await auditor(page, { contraste: false }).analyze();

    expect(conAcordar.violations).toEqual([]);
  });
});
