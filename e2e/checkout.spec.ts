import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { waitForIslands } from "./helpers";

const PRODUCT_URL = "/producto/mouse-redragon-cobra-m711";

/** Deja un producto en el carrito y abre el checkout ya hidratado. */
async function openCheckout(page: Page): Promise<void> {
  await page.goto(PRODUCT_URL);
  await waitForIslands(page);
  await page.getByRole("button", { name: /agregar .* al carrito/i }).click();

  await page.goto("/checkout");
  await waitForIslands(page);
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

    await page.getByRole("button", { name: /pagar con mercado pago/i }).click();

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

    await expect(page.getByTestId("checkout-shipping")).toHaveText("$3.990");
    await expect(page.getByTestId("checkout-total")).toHaveText("$23.980");

    await page.getByTestId("entrega-acordar").click();

    await expect(page.getByRole("radio", { name: /acordar entrega/i })).toBeChecked();
    await expect(page.getByLabel("Región", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Calle y número", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("acordar-entrega-nota")).toBeVisible();
    await expect(page.getByTestId("checkout-shipping")).toHaveText("A convenir");
    await expect(page.getByTestId("checkout-total")).toHaveText("$19.990");
  });

  test("con entrega a acordar basta el contacto para pagar", async ({ page }) => {
    await openCheckout(page);

    await page.getByTestId("entrega-acordar").click();
    await page.getByLabel("Nombre y apellido", { exact: true }).fill("Ana Soto");
    await page.getByLabel("RUT", { exact: true }).fill("123456785");
    await page.getByLabel("Correo electrónico", { exact: true }).fill("ana@gmail.com");
    await page.getByLabel(/^Teléfono/).fill("957243741");

    await page.getByRole("button", { name: /pagar con mercado pago/i }).click();

    const dialog = page.getByRole("dialog", { name: /mercado pago/i });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("$19.990");
  });

  test("se puede elegir la forma de entrega solo con el teclado", async ({ page }) => {
    await openCheckout(page);

    await page.getByRole("radio", { name: /despacho a domicilio/i }).focus();
    await page.keyboard.press("ArrowRight");

    await expect(page.getByRole("radio", { name: /acordar entrega/i })).toBeChecked();
    await expect(page.getByTestId("acordar-entrega-nota")).toBeVisible();
  });

  test("con todos los datos válidos sale a Mercado Pago", async ({ page }) => {
    await openCheckout(page);
    await fillCheckout(page);

    await page.getByRole("button", { name: /pagar con mercado pago/i }).click();

    await expect(page.getByRole("dialog", { name: /mercado pago/i })).toBeVisible();
    await expect(page.getByText(/serás redirigido para pagar/i)).toBeVisible();
  });

  test("el checkout con el formulario en error no tiene violaciones de accesibilidad", async ({
    page,
  }) => {
    await openCheckout(page);
    await page.getByRole("button", { name: /pagar con mercado pago/i }).click();
    await expect(page.getByTestId("error-nombre")).toBeVisible();

    const conDespacho = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules(["color-contrast"])
      .analyze();

    expect(conDespacho.violations).toEqual([]);

    // La otra forma de entrega cambia medio formulario, así que se audita
    // también: es una vista distinta, no un detalle de la misma.
    await page.getByTestId("entrega-acordar").click();
    await expect(page.getByTestId("acordar-entrega-nota")).toBeVisible();

    const conAcordar = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules(["color-contrast"])
      .analyze();

    expect(conAcordar.violations).toEqual([]);
  });
});
