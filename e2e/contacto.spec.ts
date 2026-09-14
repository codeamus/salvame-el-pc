import { expect, test, type Page } from "@playwright/test";
import { waitForIslands } from "./helpers";

/**
 * Formulario de contacto.
 *
 * Estos tests existen por un motivo concreto: el formulario mostró
 * "mensaje enviado ✓" sin enviar nada durante toda la vida del prototipo.
 * Nadie lo notó porque la pantalla decía exactamente lo que había que ver.
 *
 * Por eso lo que se comprueba no es que aparezca el mensaje de éxito, sino
 * que aparezca SOLO cuando el servidor confirmó — y que un fallo se vea.
 */

async function abrirContacto(page: Page): Promise<void> {
  await page.goto("/contacto");
  await waitForIslands(page);
}

async function llenar(page: Page): Promise<void> {
  await page.getByPlaceholder("Nombre", { exact: true }).fill("Ana Pérez");
  await page.getByPlaceholder("Correo electrónico").fill("ana@ejemplo.cl");
  await page.getByPlaceholder(/cuéntanos/i).fill("¿Tienen stock del mouse Redragon?");
}

test.describe("Formulario de contacto", () => {
  test("el mensaje sale de verdad y el éxito solo aparece si el servidor confirmó", async ({
    page,
  }) => {
    let enviado: Record<string, unknown> | null = null;

    await page.route("**/api/contacto", async (route) => {
      enviado = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 200, json: { ok: true } });
    });

    await abrirContacto(page);
    await llenar(page);
    await page.getByRole("button", { name: /enviar mensaje/i }).click();

    // Lo que importa: hubo petición, y llevaba lo que la persona escribió.
    await expect.poll(() => enviado).not.toBeNull();
    expect(enviado).toMatchObject({
      nombre: "Ana Pérez",
      correo: "ana@ejemplo.cl",
      mensaje: "¿Tienen stock del mouse Redragon?",
    });

    await expect(page.getByText(/gracias por escribirnos/i)).toBeVisible();
  });

  test("si el servidor rechaza, NO dice que se envió", async ({ page }) => {
    await page.route("**/api/contacto", async (route) => {
      await route.fulfill({ status: 400, json: { error: "Ese correo no parece válido." } });
    });

    await abrirContacto(page);
    await llenar(page);
    await page.getByRole("button", { name: /enviar mensaje/i }).click();

    await expect(page.getByRole("alert")).toHaveText("Ese correo no parece válido.");
    // La regresión que estos tests cuidan: el éxito no puede aparecer igual.
    //
    // Se comprueba visibilidad y no presencia: el bloque de éxito vive
    // siempre en el DOM con `hidden`, así que contar nodos daría 1 y el test
    // pasaría sin comprobar nada.
    await expect(page.getByText(/gracias por escribirnos/i)).not.toBeVisible();
  });

  test("sin conexión avisa y ofrece la alternativa, en vez de fingir", async ({ page }) => {
    await page.route("**/api/contacto", (route) => route.abort("failed"));

    await abrirContacto(page);
    await llenar(page);
    await page.getByRole("button", { name: /enviar mensaje/i }).click();

    await expect(page.getByRole("alert")).toContainText(/whatsapp/i);
    await expect(page.getByText(/gracias por escribirnos/i)).not.toBeVisible();
  });

  test("el campo trampa no es alcanzable por una persona", async ({ page }) => {
    await abrirContacto(page);

    const trampa = page.locator('input[name="sitio_web"]');
    await expect(trampa).toHaveCount(1);
    // Fuera del orden de tabulación y escondido de los lectores de pantalla:
    // si una persona pudiera llegar a él, el servidor la tomaría por un bot
    // y descartaría su mensaje en silencio.
    await expect(trampa).toHaveAttribute("tabindex", "-1");
    await expect(page.locator('[aria-hidden="true"] input[name="sitio_web"]')).toHaveCount(1);
  });
});
