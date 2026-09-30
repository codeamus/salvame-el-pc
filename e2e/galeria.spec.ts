import { expect, test } from "@playwright/test";
import { productoDePrueba, waitForIslands } from "./helpers";

/**
 * El carrusel de la ficha de producto.
 *
 * Se apoya en el scroll nativo: deslizar con el dedo y girar la rueda
 * funcionan sin JavaScript. Lo que el navegador NO da gratis es llegar ahí
 * con el teclado, y eso se olvidó al construirlo: el carrusel quedó
 * alcanzable solo con mouse o dedo hasta que el cliente subió la segunda
 * foto de un producto y la auditoría lo cazó.
 */
test.describe("Galería de la ficha", () => {
  test("se puede recorrer con el teclado", async ({ page }) => {
    const producto = await productoDePrueba(page);
    await page.goto(producto.url);
    await waitForIslands(page);

    const track = page.locator("[data-galeria-track]");
    const contador = page.locator("[data-galeria-contador]");

    // Con una sola foto no hay carrusel que recorrer y el test no aplica.
    if ((await contador.count()) === 0) return;

    await expect(track).toHaveAttribute("tabindex", "0");
    await expect(track).toHaveAttribute("aria-label", /fotos de/i);

    await track.focus();
    await expect(track).toBeFocused();

    await expect(contador).toHaveText(/^1 \//);
    await page.keyboard.press("ArrowRight");

    // Una sola foto, no dos: el scroll nativo del navegador y el salto del
    // script se sumaban y la flecha se pasaba de largo.
    await expect(contador).toHaveText(/^2 \//);

    await page.keyboard.press("ArrowLeft");
    await expect(contador).toHaveText(/^1 \//);
  });

  test("con una sola foto no agrega un punto de tabulación inútil", async ({ page }) => {
    const producto = await productoDePrueba(page);
    await page.goto(producto.url);

    const track = page.locator("[data-galeria-track]");
    const varias = (await page.locator("[data-galeria-contador]").count()) > 0;

    if (!varias) await expect(track).not.toHaveAttribute("tabindex", "0");
  });
});
