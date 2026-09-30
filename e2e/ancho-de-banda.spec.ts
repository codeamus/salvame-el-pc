import { expect, test } from "./fixtures";

/**
 * Guardián de la cuota de Supabase.
 *
 * Existe por un día concreto: la cuota del plan gratis llegó al 161% —8 GB
 * de egress sobre 8 MB de fotos guardadas— y una parte se fue en correr
 * esta misma suite. Cada corrida completa descargaba cerca de 180 MB de
 * imágenes de producto, de verdad, para comprobar cosas como que un botón
 * suma al carrito.
 *
 * El fixture de e2e/fixtures.ts las intercepta. Si alguien lo quita o lo
 * rompe, este test lo dice antes de que la factura lo diga.
 */
test("las fotos de producto no se descargan de verdad en los tests", async ({ page }) => {
  const pedidas: string[] = [];
  page.on("requestfinished", (peticion) => {
    if (peticion.url().includes(".supabase.co/storage")) pedidas.push(peticion.url());
  });

  await page.setContent(
    `<img src="https://jzonpihkeglubnheoulr.supabase.co/storage/v1/object/public/media/x.jpg">`,
  );

  // Cargó de verdad: el fixture responde con un PNG válido y no cancelando.
  // Cancelar escondería la imagen —photo-fallback.ts la oculta al fallar— y
  // haría desaparecer justo lo que miran los tests del velo y la galería.
  const foto = page.locator("img");
  await expect.poll(() => foto.evaluate((n: HTMLImageElement) => n.naturalWidth)).toBe(1);

  expect(pedidas).toHaveLength(1);
});
