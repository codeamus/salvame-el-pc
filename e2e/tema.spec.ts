import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { waitForIslands } from "./helpers";

const STORAGE_KEY = "salvameelpc:theme";

/** Color de fondo real del body, que es lo que el visitante ve. */
function bodyBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

function storedTheme(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
}

/**
 * Espera a que el fondo llegue al color pedido.
 *
 * Reintenta en vez de leer una sola vez porque el cambio de tema ahora es un
 * fundido: apenas se pulsa el botón, el color computado es un intermedio
 * entre los dos, no el destino.
 */
async function expectBackground(page: Page, color: string): Promise<void> {
  await expect.poll(() => bodyBackground(page), { timeout: 3000 }).toBe(color);
}

const DARK_BG = "rgb(21, 18, 15)";
const LIGHT_BG = "rgb(246, 241, 231)";

test.describe("Modo oscuro", () => {
  test("el botón cambia el tema y lo deja guardado", async ({ page }) => {
    await page.goto("/");
    await waitForIslands(page);

    await expectBackground(page, LIGHT_BG);
    expect(await storedTheme(page)).toBeNull();

    await page.getByRole("button", { name: /cambiar a modo oscuro/i }).click();

    await expectBackground(page, DARK_BG);
    expect(await storedTheme(page)).toBe("dark");
    // La etiqueta pasa a ofrecer el camino de vuelta.
    await expect(page.getByRole("button", { name: /cambiar a modo claro/i })).toBeVisible();
  });

  test("vuelve a claro y también lo guarda", async ({ page }) => {
    await page.goto("/");
    await waitForIslands(page);

    await page.getByRole("button", { name: /cambiar a modo oscuro/i }).click();
    await page.getByRole("button", { name: /cambiar a modo claro/i }).click();

    await expectBackground(page, LIGHT_BG);
    expect(await storedTheme(page)).toBe("light");
  });

  test("el tema elegido sobrevive a la navegación del ClientRouter", async ({ page }) => {
    await page.goto("/");
    await waitForIslands(page);
    await page.getByRole("button", { name: /cambiar a modo oscuro/i }).click();

    // Navegación interna: el router reemplaza los atributos de <html> por los
    // del documento nuevo, que es HTML estático y no trae data-theme.
    await page.getByRole("link", { name: "Tienda", exact: true }).click();
    await expect(page).toHaveURL(/\/tienda/);
    await waitForIslands(page);

    await expectBackground(page, DARK_BG);
    await expect(page.getByRole("button", { name: /cambiar a modo claro/i })).toBeVisible();
  });

  test("el tema elegido sobrevive a una recarga completa", async ({ page }) => {
    await page.goto("/");
    await waitForIslands(page);
    await page.getByRole("button", { name: /cambiar a modo oscuro/i }).click();

    await page.reload();

    await expectBackground(page, DARK_BG);
  });

  test("se aplica antes del primer pintado, sin flash", async ({ page }) => {
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
      STORAGE_KEY,
      "dark",
    ] as const);

    // Se mira apenas termina de parsearse el HTML, sin esperar a que
    // hidraten los islands: si el atributo ya está acá, es que lo puso el
    // script en línea del <head> y el visitante nunca vio la página clara.
    await page.goto("/", { waitUntil: "domcontentloaded" });

    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  });

  test("una elección corrupta en localStorage no rompe nada", async ({ page }) => {
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
      STORAGE_KEY,
      "🌚",
    ] as const);

    await page.goto("/");
    await waitForIslands(page);

    // Se ignora y se cae al sistema, que en el proyecto por defecto es claro.
    await expectBackground(page, LIGHT_BG);
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
  });
});

test.describe("Fundido al cambiar de tema", () => {
  test("el fundido se activa al cambiar y se apaga solo", async ({ page }) => {
    await page.goto("/");
    await waitForIslands(page);

    const root = page.locator("html");
    await expect(root).not.toHaveClass(/theme-switching/);

    await page.getByRole("button", { name: /cambiar a modo oscuro/i }).click();

    // Mientras dura, la clase habilita la transición de color en toda la
    // página; después tiene que irse, o cada hover heredaría esa duración.
    await expect(root).toHaveClass(/theme-switching/);

    // La clase por sí sola no prueba nada: lo que importa es que mientras
    // está puesta el body tenga una transición de color con duración real.
    expect(await page.evaluate(() => getComputedStyle(document.body).transitionDuration)).toContain(
      "0.26s",
    );

    await expect(root).not.toHaveClass(/theme-switching/, { timeout: 3000 });

    // Y el tema quedó cambiado igual.
    await expectBackground(page, DARK_BG);
  });

  test("cambiar dos veces seguidas no deja la clase pegada", async ({ page }) => {
    await page.goto("/");
    await waitForIslands(page);

    const toggle = page.getByRole("button", { name: /cambiar a modo/i });
    await toggle.click();
    await toggle.click();

    await expect(page.locator("html")).not.toHaveClass(/theme-switching/, { timeout: 2000 });
    await expectBackground(page, LIGHT_BG);
  });
});

test.describe("Fundido con menos animación pedida", () => {
  // En Playwright 1.62 `reducedMotion` no es opción de primer nivel: va
  // dentro de contextOptions.
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("no se activa el fundido, pero el tema cambia igual", async ({ page }) => {
    await page.goto("/");
    await waitForIslands(page);

    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
      true,
    );

    await page.getByRole("button", { name: /cambiar a modo oscuro/i }).click();

    // Lecturas únicas y sin reintentos, a propósito: una aserción que
    // reintenta pasaría igual con el fundido activo, porque la clase se va
    // sola a los 260 ms. Acá lo que se comprueba es que nunca llegó a estar.
    expect(await page.evaluate(() => document.documentElement.className)).not.toContain(
      "theme-switching",
    );
    expect(
      await page.evaluate(() => getComputedStyle(document.body).transitionDuration),
    ).not.toContain("0.26s");

    // El color sí se comprueba con reintentos, aunque acá no haya fundido: el
    // bloque global de prefers-reduced-motion deja una transición de 0,01 ms
    // en todo, así que una lectura síncrona todavía devuelve el color de
    // origen. Es imperceptible, pero medible — y confunde si no se avisa.
    await expectBackground(page, DARK_BG);
  });
});

test.describe("Modo oscuro por preferencia del sistema", () => {
  test.use({ colorScheme: "dark" });

  test("sin elección guardada se sigue al sistema, sin JavaScript de por medio", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForIslands(page);

    await expectBackground(page, DARK_BG);
    // No hay atributo: lo resuelve la media query de tokens.css sola.
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
    expect(await storedTheme(page)).toBeNull();
  });

  test("elegir claro a mano le gana a un sistema en oscuro", async ({ page }) => {
    await page.goto("/");
    await waitForIslands(page);

    await page.getByRole("button", { name: /cambiar a modo claro/i }).click();

    await expectBackground(page, LIGHT_BG);
    expect(await storedTheme(page)).toBe("light");
  });
});

const PAGES: readonly { name: string; path: string }[] = [
  { name: "portada", path: "/" },
  { name: "catálogo", path: "/tienda" },
  { name: "ficha de producto", path: "/producto/mouse-redragon-cobra-m711" },
  { name: "servicio técnico", path: "/servicio-tecnico" },
  { name: "contacto", path: "/contacto" },
  { name: "carrito vacío", path: "/carrito" },
  { name: "404", path: "/pagina-inexistente" },
];

test.describe("Accesibilidad en modo oscuro", () => {
  test.use({ colorScheme: "dark" });

  for (const { name, path } of PAGES) {
    test(`la página de ${name} no tiene violaciones en oscuro`, async ({ page }) => {
      await page.goto(path);
      await waitForIslands(page);

      // A diferencia del modo claro, acá NO se excluye color-contrast: sobre
      // el fondo oscuro el coral llega a 6:1 y cumple AA, así que la excepción
      // que el handoff pide para el modo claro no hace falta y se aprovecha
      // para cubrir de verdad el contraste de toda la paleta nueva.
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  }
});
