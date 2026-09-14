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
}
