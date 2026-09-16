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

test.describe("Mapa de la tienda", () => {
  /**
   * El mapa se rompió en silencio una vez y así se queda cubierto.
   *
   * En el panel había un enlace de los que da el botón Compartir de Google
   * Maps (maps.app.goo.gl/…). Google responde a esos con
   * `x-frame-options: SAMEORIGIN`, así que el navegador se niega a
   * dibujarlos dentro de un <iframe>: la página mostraba un recuadro vacío,
   * sin ningún error, y nadie tenía cómo darse cuenta.
   *
   * Lo que se comprueba no es qué dirección es —eso lo edita el cliente—,
   * sino que lo que termine en el src sea una forma INCRUSTABLE, o que en su
   * defecto haya una salida para el visitante.
   */
  test("o se puede incrustar, o hay un enlace para salir a Google Maps", async ({ page }) => {
    await page.goto("/contacto");

    const mapa = page.locator("iframe[title='Ubicación de la tienda']");

    if ((await mapa.count()) === 0) {
      // Sin mapa cargado se muestra el rayado; si hay un enlace que no se
      // pudo traducir, tiene que ofrecer la salida a Maps.
      const salida = page.getByRole("link", { name: /ver en google maps/i });
      if ((await salida.count()) > 0) {
        await expect(salida).toHaveAttribute("target", "_blank");
      }
      return;
    }

    const src = (await mapa.getAttribute("src")) ?? "";
    // /maps/embed es la única forma que Google sirve sin x-frame-options.
    expect(src).toMatch(/^https:\/\/www\.google\.[a-z.]+\/maps\/embed\?/);
    expect(src).not.toContain("goo.gl");
  });

  /**
   * El embed de Google no tiene modo oscuro: comprobado, no supuesto — se
   * ve igual con el sistema en claro que en oscuro. Lo oscurece el sitio
   * con un `filter`, así que lo que se cubre es que ese filtro esté puesto
   * cuando corresponde y NO cuando no.
   */
  test("el mapa se oscurece con el sitio, y solo ahí", async ({ page }) => {
    await page.goto("/contacto");
    const mapa = page.locator("iframe.mapa-embebido");
    if ((await mapa.count()) === 0) return;

    // Elección explícita: oscuro.
    await page.emulateMedia({ colorScheme: "light" });
    await page.getByRole("button", { name: /cambiar a modo oscuro/i }).click();
    await expect(mapa).toHaveCSS("filter", /invert/);

    // Y de vuelta a claro, sin filtro. Este es el caso que se rompe solo si
    // alguien escribe la regla con la media query y se olvida del atributo.
    await page.getByRole("button", { name: /cambiar a modo claro/i }).click();
    await expect(mapa).toHaveCSS("filter", "none");
  });

  test("el borde del mapa no se invierte junto con el mapa", async ({ page }) => {
    // `filter` pinta también el borde del elemento: con la línea en el
    // <iframe>, en oscuro se invertía hasta desaparecer y el mapa quedaba
    // como el único recuadro de la columna sin marco. Vive en el envoltorio.
    await page.goto("/contacto");
    const mapa = page.locator("iframe.mapa-embebido");
    if ((await mapa.count()) === 0) return;

    await expect(mapa).toHaveCSS("border-top-width", "0px");
    await expect(mapa.locator("xpath=..")).not.toHaveCSS("border-top-width", "0px");
  });
});
