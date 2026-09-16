import { expect, test, type Page } from "@playwright/test";

/**
 * Los videos del taller.
 *
 * El reproductor de YouTube no se incrusta hasta que alguien lo pide: hasta
 * ese momento lo que hay es una carátula dibujada por el sitio, con el mismo
 * marco, el mismo círculo de play y el mismo pie mono que los huecos que
 * todavía no tienen video.
 *
 * Los tres tests de acá cubren las tres mitades de eso —la que se ve, la que
 * no se carga, y la que pasa al hacer clic—, sin depender de que YouTube
 * esté arriba ni de qué videos haya cargado el cliente esta semana.
 */

/** Evita salir a YouTube de verdad: devuelve un reproductor de mentira. */
async function stubYoutube(page: Page): Promise<void> {
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body>reproductor de prueba</body></html>",
    }),
  );
}

test.describe("Videos del taller", () => {
  test("no carga el reproductor de YouTube hasta que se lo pide", async ({ page }) => {
    const deYoutube: string[] = [];
    page.on("request", (peticion) => {
      const host = new URL(peticion.url()).hostname;
      // i.ytimg.com queda fuera a propósito: es la miniatura, un dominio
      // estático sin cookies, y es justamente lo que reemplaza al player.
      if (/youtube|googlevideo/.test(host)) deYoutube.push(host);
    });

    await page.goto("/servicio-tecnico");
    await expect(page.locator("[data-video]").first()).toBeVisible();

    expect(deYoutube).toEqual([]);
    await expect(page.locator("[data-video] iframe")).toHaveCount(0);
  });

  test("el clic pone el reproductor en la página, sin irse a YouTube", async ({ page }) => {
    await stubYoutube(page);
    await page.goto("/servicio-tecnico");

    const play = page.locator("[data-video-play]").first();
    // Si el cliente todavía no cargó ningún video, no hay nada que probar.
    if ((await play.count()) === 0) return;

    await play.click();

    const reproductor = page.locator("[data-video] iframe").first();
    await expect(reproductor).toHaveAttribute("src", /autoplay=1/);
    await expect(reproductor).toHaveAttribute("src", /youtube-nocookie\.com/);
    // Lo importante: seguimos en el sitio. Sin el preventDefault, el <a> se
    // habría llevado a la persona a youtube.com y no vuelve.
    await expect(page).toHaveURL(/\/servicio-tecnico/);
  });

  test("el hueco sin video no finge ser un botón", async ({ page }) => {
    await page.goto("/servicio-tecnico");

    const cajas = page.locator("[data-video]");
    const total = await cajas.count();
    expect(total).toBeGreaterThan(0);

    for (let i = 0; i < total; i += 1) {
      const caja = cajas.nth(i);
      const enlaces = caja.locator("[data-video-play]");

      if ((await enlaces.count()) === 0) {
        // Sin video: el círculo es decoración. Que no reciba el foco es lo
        // que evita que alguien navegando con el teclado se detenga en algo
        // que no hace nada.
        await expect(caja.locator("a, button")).toHaveCount(0);
      } else {
        // Con video: tiene que tener nombre accesible y destino real, para
        // que funcione aunque el JavaScript no llegue nunca.
        await expect(enlaces).toHaveAttribute("aria-label", /reproducir/i);
        await expect(enlaces).toHaveAttribute("href", /^https?:\/\//);
      }
    }
  });
});
