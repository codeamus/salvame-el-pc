import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { waitForIslands } from "./helpers";

const PAGES = [
  { name: "términos y condiciones", path: "/terminos-y-condiciones", titulo: "Términos y" },
  { name: "política de privacidad", path: "/politica-de-privacidad", titulo: "Política de" },
] as const;

/**
 * Busca palabras pegadas por un salto de línea de la plantilla.
 *
 * Astro aplica las reglas de espaciado de JSX: un salto de línea entre texto
 * y un elemento inline NO produce un espacio. Prettier reformatea estos
 * archivos cada vez que se editan y puede partir una línea justo ahí,
 * dejando "nuestrapágina de contacto" en un documento legal sin que nadie lo
 * note en la revisión.
 *
 * Se detecta sobre el DOM y no sobre el texto plano porque ahí la evidencia
 * sigue estando: un nodo de texto que termina en letra pegado a un elemento
 * inline que empieza en letra es, siempre, un espacio que se perdió.
 */
function palabrasPegadas(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const prose = document.querySelector(".legal-prose");
    if (!prose) return ["no se encontró .legal-prose"];

    const empiezaEnLetra = /^[\p{L}\p{N}]/u;
    const terminaEnLetra = /[\p{L}\p{N}]$/u;
    const encontrados: string[] = [];

    for (const el of prose.querySelectorAll("a, strong, em, span, time, b, i, s, code")) {
      const propio = el.textContent ?? "";
      const previo = el.previousSibling;
      const siguiente = el.nextSibling;

      if (
        previo?.nodeType === Node.TEXT_NODE &&
        terminaEnLetra.test(previo.textContent ?? "") &&
        empiezaEnLetra.test(propio)
      ) {
        encontrados.push(`${(previo.textContent ?? "").slice(-30)}◀▶${propio.slice(0, 30)}`);
      }

      if (
        siguiente?.nodeType === Node.TEXT_NODE &&
        terminaEnLetra.test(propio) &&
        empiezaEnLetra.test(siguiente.textContent ?? "")
      ) {
        encontrados.push(`${propio.slice(-30)}◀▶${(siguiente.textContent ?? "").slice(0, 30)}`);
      }
    }

    return encontrados;
  });
}

test.describe("Páginas legales", () => {
  for (const { name, path, titulo } of PAGES) {
    test(`la página de ${name} carga con su índice`, async ({ page }) => {
      await page.goto(path);
      await waitForIslands(page);

      await expect(page.getByRole("heading", { level: 1 })).toContainText(titulo);
      await expect(
        page.getByRole("navigation", { name: /secciones de este documento/i }),
      ).toBeVisible();
      // La fecha es una constante, no la del build: tiene que ser trazable
      // qué versión del documento aceptó cada persona.
      await expect(page.locator("time[datetime]")).toHaveAttribute("datetime", "2026-08-19");
    });

    test(`la página de ${name} no tiene palabras pegadas`, async ({ page }) => {
      await page.goto(path);
      expect(await palabrasPegadas(page)).toEqual([]);
    });

    test(`el índice de ${name} lleva a sus secciones`, async ({ page }) => {
      await page.goto(path);
      await waitForIslands(page);

      const indice = page.getByRole("navigation", { name: /secciones de este documento/i });

      // En pantalla chica el índice viene plegado en un <details>, y un
      // <details> cerrado no expone su contenido al árbol de accesibilidad.
      // Hay que abrirlo, que es justo lo que hace una persona en el teléfono.
      const resumen = indice.locator("summary");
      if (await resumen.isVisible()) await resumen.click();

      const enlaces = await indice.getByRole("link").all();
      expect(enlaces.length).toBeGreaterThan(5);

      // Cada entrada del índice tiene que apuntar a un id que exista: un
      // ancla rota en un documento legal manda al visitante a la nada.
      for (const enlace of enlaces) {
        const href = await enlace.getAttribute("href");
        expect(href).toMatch(/^#/);
        await expect(page.locator(href ?? "")).toHaveCount(1);
      }
    });
  }

  test("los datos pendientes del cliente quedan marcados a la vista", async ({ page }) => {
    await page.goto("/terminos-y-condiciones");

    // Mientras haya placeholders tienen que verse distintos. Si el cliente ya
    // completó LEGAL en config/site.ts, no queda ninguno y el test pasa igual.
    const pendientes = page.locator("[data-legal-pendiente]");
    for (const marca of await pendientes.all()) {
      await expect(marca).toHaveClass(/legal-pendiente/);
      await expect(marca).toHaveText(/^\[.*\]$/);
    }
  });
});

test.describe("Enlaces legales en el footer", () => {
  test("están los dos documentos y ya no está Garantías", async ({ page }) => {
    await page.goto("/");
    await waitForIslands(page);

    const ayuda = page.getByRole("navigation", { name: "Ayuda" });

    await expect(ayuda.getByRole("link", { name: "Términos y condiciones" })).toHaveAttribute(
      "href",
      "/terminos-y-condiciones",
    );
    await expect(ayuda.getByRole("link", { name: "Política de privacidad" })).toHaveAttribute(
      "href",
      "/politica-de-privacidad",
    );
    await expect(page.getByText("Garantías")).toHaveCount(0);
  });

  test("«Envíos y devoluciones» aterriza en la sección de despacho", async ({ page }) => {
    await page.goto("/");
    await waitForIslands(page);

    await page
      .getByRole("navigation", { name: "Ayuda" })
      .getByRole("link", { name: "Envíos y devoluciones" })
      .click();

    await expect(page).toHaveURL(/\/terminos-y-condiciones#despacho$/);
    await expect(page.locator("#despacho")).toBeVisible();
  });
});

test.describe("Accesibilidad de las páginas legales", () => {
  for (const { name, path } of PAGES) {
    test(`${name} no tiene violaciones en modo claro`, async ({ page }) => {
      await page.goto(path);
      await waitForIslands(page);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .disableRules(["color-contrast"])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  }

  test.describe("en modo oscuro", () => {
    test.use({ colorScheme: "dark" });

    for (const { name, path } of PAGES) {
      test(`${name} no tiene violaciones en oscuro`, async ({ page }) => {
        await page.goto(path);
        await waitForIslands(page);

        // Con la regla de contraste activada, igual que el resto del modo
        // oscuro: la paleta oscura sí cumple AA.
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();

        expect(results.violations).toEqual([]);
      });
    }
  });
});
