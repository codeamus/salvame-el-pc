import { expect, test, type Page } from "@playwright/test";
import { formatearCLP, leerReglasEnvio, waitForIslands } from "./helpers";

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

test.describe("Columna de datos", () => {
  test("ya no hay dirección ni mapa", async ({ page }) => {
    // La tienda no tiene local a la calle. Se sacaron los dos a propósito y
    // este test es para que no vuelvan sin que nadie lo decida.
    await page.goto("/contacto");

    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByText(/taller y tienda/i)).toHaveCount(0);
  });

  test("los montos del despacho salen de las reglas, no escritos a mano", async ({ page }) => {
    // El bloque de despacho reemplazó al mapa, y sus montos vienen de las
    // mismas reglas que cotiza el carrito. Si alguien los escribiera acá, el
    // día que el cliente suba el envío gratis a $60.000 la página de
    // contacto seguiría prometiendo $50.000 — y esa promesa se cobra.
    await page.goto("/contacto");

    const reglas = await leerReglasEnvio(page);
    // Acotado a la columna: la cinta promo de arriba también dice "envío
    // gratis sobre", y sin esto el locator coincide con las dos.
    const columna = page.getByRole("main").locator("section").last();
    const despacho = columna.getByRole("listitem").filter({ hasText: /envío gratis sobre/i });

    await expect(despacho).toContainText(formatearCLP(reglas.freeShippingFromCLP));
    await expect(despacho).toContainText(formatearCLP(reglas.shippingCostCLP));
  });

  test("WhatsApp está una sola vez, y es el canal destacado", async ({ page }) => {
    // Estaba como un botón más entre las redes, del mismo tamaño que
    // Facebook. Subió a los canales directos; tenerlo en los dos lugares lo
    // volvía ruido. (El botón flotante es del layout y no cuenta acá.)
    await page.goto("/contacto");

    const columna = page.getByRole("main").locator("section").last();
    await expect(columna.getByRole("link", { name: /whatsapp/i })).toHaveCount(1);
  });
});
