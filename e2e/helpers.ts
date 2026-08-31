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
