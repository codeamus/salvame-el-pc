import { test as base, expect, type Route } from "@playwright/test";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * LAS FOTOS NO SE DESCARGAN DE VERDAD
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Esto se escribió el día que la cuota de Supabase se pasó al 161%.
 *
 * Las fotos de producto se sirven directo desde Supabase Storage, y la
 * suite las descargaba todas, de verdad, en cada corrida: 36 visitas al
 * catálogo (10 fotos), 22 a la portada (12) y 7 a una ficha (16), por dos
 * navegadores. Cerca de 180 MB por corrida completa. Diez corridas en una
 * tarde de trabajo son casi 2 GB de la cuota del cliente gastados en
 * comprobar que un botón suma al carrito.
 *
 * Ahora esas peticiones se responden acá con un PNG de 1×1. Se responden,
 * no se cancelan: `photo-fallback.ts` esconde las imágenes que fallan, así
 * que cancelarlas haría desaparecer justo los elementos que miran los tests
 * del velo y de la galería. Con una imagen válida el layout es el mismo y
 * el DOM también.
 *
 * Lo que NO se toca son las URLs: se sigue comprobando que la página apunte
 * a donde debe. Lo único que cambia es que no viajan los bytes.
 *
 * Desde que las fotos pasan por el CDN de Vercel hay que atajar DOS formas.
 * La optimizada (/_vercel/image?url=…) además no existe fuera de Vercel: la
 * suite corre contra el build servido en local, donde esa ruta da 404, la
 * imagen falla, photo-fallback la esconde y se caen los tests del velo y de
 * la galería. Atajarla acá arregla las dos cosas de una vez.
 */

/** PNG transparente de 1×1, el más chico que existe. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

export const test = base.extend({
  page: async ({ page }, use) => {
    const responderConPixel = (route: Route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: PIXEL });

    await page.route("**/*.supabase.co/storage/**", responderConPixel);
    await page.route("**/_vercel/image**", responderConPixel);
    await use(page);
  },
});

export { expect };
export type { Page, Locator } from "@playwright/test";
