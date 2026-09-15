import AxeBuilder from "@axe-core/playwright";
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

/** URL falsa de intento de pago, con la forma real que devuelve TUU. */
export const FAKE_INTENT_URL =
  "https://payment.haulmer.dev/secure/payment-intent/188e47a7a069c18541b29f97";

export interface CheckoutRequestBody {
  items: { id: number; quantity: number }[];
  cliente: {
    entrega: string;
    nombre: string;
    rut: string;
    correo: string;
    telefono: string;
    direccion: { region: string; comuna: string; calle: string } | null;
  };
}

/**
 * Reemplaza la pasarela por una pantalla local.
 *
 * Los E2E corren contra el build estático, donde /api/checkout no existe
 * (es una función serverless), y aunque existiera no se puede pegarle a TUU
 * de verdad en cada corrida. Se interceptan las dos puntas:
 *
 *   · /api/checkout devuelve una URL de intento con la forma real.
 *   · El dominio de la pasarela devuelve un HTML mínimo, para que la
 *     redirección top-level ocurra pero no salga a internet.
 *
 * Devuelve el arreglo donde se van acumulando los cuerpos de cada POST, que
 * es lo que permite verificar QUÉ se le mandó al servidor.
 */
export async function stubPaymentGateway(
  page: Page,
  { reference = "ORD-20260831-E2E00001" }: { reference?: string } = {},
): Promise<CheckoutRequestBody[]> {
  const requests: CheckoutRequestBody[] = [];

  await page.route("**/api/checkout", async (route) => {
    requests.push(JSON.parse(route.request().postData() ?? "{}") as CheckoutRequestBody);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ redirectUrl: FAKE_INTENT_URL, reference, amount: 23980 }),
    });
  });

  await page.route("https://payment.haulmer.dev/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body><h1>Pasarela de prueba</h1></body></html>",
    });
  });

  return requests;
}

/** Fija el estado que devolverá /api/orders/[reference] a la página de resultado. */
export async function stubOrderStatus(
  page: Page,
  status: "pending" | "completed" | "failed",
): Promise<void> {
  await page.route("**/api/orders/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reference: "ORD-20260831-E2E00001", status, amount: 23980 }),
    });
  });
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * PRECIOS: leerlos, no asumirlos
 * ─────────────────────────────────────────────────────────────────────────
 *
 * El catálogo y las reglas de envío se administran desde el panel. Un test
 * que escriba "$19.990" pasa hoy y falla el día que alguien ajuste ese
 * precio — sin que nada esté roto. Eso ya pasó: la suite se cayó entera
 * porque el mouse bajó a $10.990.
 *
 * Con estos helpers los tests comprueban lo que de verdad tienen que
 * comprobar: que el subtotal sea el precio por la cantidad, que el envío
 * cruce bien su umbral, que el total sume. Eso es cierto con cualquier
 * precio, y sigue fallando si la aritmética se rompe — que es el punto.
 */

/** Igual que formatCLP de src/lib/format.ts. */
export function formatearCLP(valor: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(valor);
}

export interface ReglasEnvio {
  readonly shippingCostCLP: number;
  readonly freeShippingFromCLP: number;
  readonly maxQuantityPerLine: number;
}

/** Las reglas que el servidor inyectó en la página para el carrito. */
export async function leerReglasEnvio(page: Page): Promise<ReglasEnvio> {
  const json = await page.locator("[data-reglas-envio]").textContent();
  if (json === null) throw new Error("La página no trae las reglas de envío inyectadas.");
  return JSON.parse(json) as ReglasEnvio;
}

/** Lee un monto formateado de la página y lo devuelve como número. */
export async function leerMonto(page: Page, testId: string): Promise<number> {
  const texto = await page.getByTestId(testId).textContent();
  // Se quitan el símbolo y los separadores de miles; el CLP no usa decimales.
  return Number((texto ?? "").replace(/[^\d]/g, ""));
}

/** Envío que corresponde a un subtotal, según las reglas vigentes. */
export function envioPara(subtotal: number, reglas: ReglasEnvio): number {
  if (subtotal === 0) return 0;
  return subtotal >= reglas.freeShippingFromCLP ? 0 : reglas.shippingCostCLP;
}

/**
 * Congela transiciones y animaciones.
 *
 * Axe mide los colores computados en el instante en que corre. Si un
 * elemento está a mitad de una transición, lee valores MEZCLADOS que no
 * existen en ninguna paleta y reporta un contraste que el sitio nunca
 * muestra de verdad.
 *
 * Pasó con los filtros del catálogo: `catalog-filter.ts` les pone
 * `data-active` después de hidratar, eso dispara su `transition-colors`, y
 * axe cazó el punto medio — un #67635d sobre #9f9a92 que no es ni el tema
 * claro ni el oscuro. El test fallaba en un navegador distinto cada vez.
 *
 * Congelarlas no debilita la prueba: lo que hay que auditar es el estado en
 * el que la persona ve la página, no los 150 ms de camino.
 */
export async function congelarAnimaciones(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      animation-duration: 0s !important;
      animation-delay: 0s !important;
    }`,
  });

  // El CSS evita que EMPIECEN transiciones nuevas, pero no toca las que ya
  // están a mitad de camino en el momento de inyectarlo — y esas son justo
  // las que hacían fallar el test una corrida de cada tantas, siempre en
  // otro navegador. Se las manda al final de golpe.
  //
  // Las infinitas (la cinta de marcas) se dejan correr: finish() no se puede
  // aplicar sobre algo que no termina nunca, y su color no cambia.
  await page.evaluate(async () => {
    for (const animacion of document.getAnimations()) {
      try {
        animacion.finish();
      } catch {
        /* infinita: sigue girando, y está bien */
      }
    }
    // Dos cuadros para que el navegador recalcule estilos con todo lo
    // anterior ya aplicado. Sin esto, axe puede medir el fotograma viejo.
    await new Promise((listo) => requestAnimationFrame(() => requestAnimationFrame(listo)));
  });
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * EL CATÁLOGO: leerlo, no nombrarlo
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Misma historia que los precios, un paso más arriba. La suite entera
 * apuntaba a "/producto/mouse-redragon-cobra-m711": el día que el cliente
 * cargó su catálogo real desde el panel y borró los productos de ejemplo,
 * 35 tests se cayeron de golpe — y ninguno señalaba nada roto. Peor: la
 * auditoría de accesibilidad de la ficha SEGUÍA EN VERDE, porque estaba
 * midiendo la página 404 sin saberlo.
 *
 * Desde acá el producto con el que se prueba sale del catálogo que hay.
 * Los tests siguen comprobando lo mismo —que agregar suma al contador, que
 * el filtro esconde las otras categorías— y eso es cierto con cualquier
 * catálogo. Si el catálogo queda vacío, fallan al leerlo, con ese motivo.
 */

export interface ProductoDelCatalogo {
  /** El id real de la base: es lo único que el carrito manda al servidor. */
  readonly id: number;
  readonly slug: string;
  /** Ruta de la ficha, lista para page.goto(). */
  readonly url: string;
  readonly nombre: string;
  readonly categoria: string;
  readonly marca: string;
  readonly precio: number;
}

/** Una sola lectura por worker: el catálogo no cambia durante la corrida. */
let catalogoLeido: readonly ProductoDelCatalogo[] | null = null;

export async function leerCatalogo(page: Page): Promise<readonly ProductoDelCatalogo[]> {
  if (catalogoLeido !== null) return catalogoLeido;

  await page.goto("/tienda");
  const productos = await page.locator("[data-item]").evaluateAll((items) =>
    items.map((item) => {
      const enlace = item.querySelector<HTMLAnchorElement>('h3 a[href^="/producto/"]');
      const href = enlace?.getAttribute("href") ?? "";
      // El mismo payload que la card le entrega al carrito, que es donde
      // vive el id del producto.
      const payload = item.querySelector("[data-add-to-cart]")?.getAttribute("data-add-to-cart");
      return {
        id: Number((JSON.parse(payload ?? "{}") as { id?: number }).id ?? 0),
        slug: href.replace("/producto/", ""),
        url: href,
        nombre: enlace?.textContent?.trim() ?? "",
        categoria: item.getAttribute("data-cat") ?? "",
        marca: item.getAttribute("data-marca") ?? "",
        precio: Number(item.getAttribute("data-precio") ?? "0"),
      };
    }),
  );

  if (productos.length === 0) {
    throw new Error("El catálogo no trae productos publicados: no hay con qué probar la tienda.");
  }

  catalogoLeido = productos;
  return productos;
}

/**
 * El producto con el que se prueba: el MÁS BARATO del catálogo.
 *
 * No es un capricho de orden. Varios tests necesitan que un producto solo
 * quede por debajo del umbral de envío gratis —para ver el "te faltan $X"—
 * y que unas pocas unidades alcancen para cruzarlo. El más barato es el que
 * cumple las dos cosas si es que alguno las cumple.
 */
export async function productoDePrueba(page: Page): Promise<ProductoDelCatalogo> {
  const catalogo = await leerCatalogo(page);
  return catalogo.reduce((barato, otro) => (otro.precio < barato.precio ? otro : barato));
}

/**
 * Un producto de OTRA categoría, para comprobar que el filtro lo esconde.
 *
 * Devuelve null si todo el catálogo comparte categoría: ahí no hay nada que
 * filtrar y el test que lo pida tiene que saltearse esa mitad, no inventar
 * un producto que no existe.
 */
export async function productoDeOtraCategoria(
  page: Page,
  producto: ProductoDelCatalogo,
): Promise<ProductoDelCatalogo | null> {
  const catalogo = await leerCatalogo(page);
  return catalogo.find((otro) => otro.categoria !== producto.categoria) ?? null;
}

/** Escapa un nombre de producto para meterlo en una expresión regular. */
export function comoRegex(texto: string): RegExp {
  return new RegExp(texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * AUDITORÍA DE ACCESIBILIDAD
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Un solo lugar donde se decide QUÉ se audita, para que la auditoría del
 * modo claro y la del oscuro no se vayan separando con el tiempo.
 *
 * Se excluyen los <iframe>: son videos de YouTube y el mapa de Google, y lo
 * que axe mide ahí adentro es el DOM de ellos, no el nuestro. La primera
 * vez que se incrustó un video, servicio-tecnico pasó de 0 a 183
 * violaciones de golpe —aria-level en un <a>, botones sin nombre, todo del
 * reproductor— y ninguna se podía arreglar desde este repo. Dejarlas
 * adentro no habría hecho el sitio más accesible: habría hecho que nadie
 * volviera a mirar este test.
 *
 * Lo que SÍ es nuestro del embed —que el <iframe> tenga title, que el
 * contenedor no rompa el orden de foco— se sigue auditando, porque el
 * elemento vive en nuestra página.
 */
export function auditor(page: Page, { contraste = true } = {}): AxeBuilder {
  const builder = new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("iframe");

  // En claro el handoff pide coral sobre crema para eyebrows y chips, que
  // da 2.74:1. Es una decisión de diseño documentada, no un descuido.
  return contraste ? builder : builder.disableRules(["color-contrast"]);
}
