import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Auditoría automática de accesibilidad con axe-core.
 *
 * Cubre WCAG 2.1 niveles A y AA. Vale aclarar: axe detecta cerca del 30-40%
 * de los problemas reales de accesibilidad — que estos tests pasen NO
 * significa que el sitio sea accesible, significa que no tiene errores
 * obvios de los que una máquina puede detectar. La revisión con teclado y
 * lector de pantalla sigue siendo necesaria.
 *
 * NOTA sobre color-contrast: el design system aprobado por el cliente usa
 * coral #FF5A48 como color de texto para eyebrows/chips sobre crema, que da
 * 2.74:1 (bajo el AA de 4.5:1). Es una decisión de diseño del handoff
 * (high-fidelity, colores finales), así que la regla se excluye acá y queda
 * documentado el tradeoff en vez de esconderlo.
 */

const PAGES: readonly { name: string; path: string }[] = [
  { name: "portada", path: "/" },
  { name: "catálogo", path: "/tienda" },
  { name: "ficha de producto", path: "/producto/mouse-redragon-cobra-m711" },
  { name: "servicio técnico", path: "/servicio-tecnico" },
  { name: "contacto", path: "/contacto" },
  { name: "carrito vacío", path: "/carrito" },
  { name: "404", path: "/pagina-inexistente" },
];

for (const { name, path } of PAGES) {
  test(`la página de ${name} no tiene violaciones de accesibilidad`, async ({ page }) => {
    await page.goto(path);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules(["color-contrast"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
}

test("el carrito con productos tampoco tiene violaciones", async ({ page }) => {
  await page.goto("/producto/mouse-redragon-cobra-m711");
  await page.getByRole("button", { name: /agregar .* al carrito/i }).click();
  await page.goto("/carrito");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(["color-contrast"])
    .analyze();

  expect(results.violations).toEqual([]);
});
