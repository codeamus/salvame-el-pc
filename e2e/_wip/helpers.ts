import { expect, type Page } from "@playwright/test";

/**
 * Espera a que terminen de hidratar los islands de la página.
 *
 * Hace falta por cómo funciona Astro: el island se renderiza en el servidor
 * y recién después el navegador descarga el componente para hidratarlo. En
 * ese hueco el botón ya existe en el DOM y Playwright lo considera
 * clickeable, pero todavía no tiene handler — el click se pierde, el carrito
 * queda en 0 y el test falla de forma intermitente según cuán cargada esté
 * la máquina.
 *
 * Con /carrito y /checkout el problema es aún más visible: el servidor no
 * tiene acceso al localStorage, así que siempre renderiza el carrito vacío y
 * el contenido real aparece solo al hidratar.
 *
 * Astro marca cada island con el atributo `ssr` y se lo quita al hidratar,
 * así que la ausencia de `astro-island[ssr]` es la señal exacta. En páginas
 * sin islands la condición ya se cumple y la llamada no cuesta nada.
 */
export async function waitForIslands(page: Page): Promise<void> {
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
}
