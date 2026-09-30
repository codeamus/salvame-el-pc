import { getTuuConfig } from "./env";
import { signPayload } from "./signature";
import type { TuuEnvName, TuuPaymentIntentInput } from "./types";

/**
 * Cliente de creación de intentos de pago en TUU.
 *
 * El sitio nunca ve datos de tarjeta: se crea un intento, TUU devuelve una
 * URL y el comprador paga en el dominio de la pasarela.
 */

export interface CreatePaymentIntentArgs {
  /** Entero en CLP, ya calculado en el servidor. */
  readonly amount: number;
  /** Único por orden. */
  readonly reference: string;
  readonly description?: string;
  readonly customer: {
    readonly email: string;
    readonly firstName: string;
    readonly lastName: string;
    /** E.164: +56912345678 */
    readonly phone: string;
  };
}

export interface PaymentIntentResult {
  readonly redirectUrl: string;
  readonly reference: string;
  readonly amount: number;
  readonly env: TuuEnvName;
}

/**
 * Con `X-REDIRECT: false` y firma válida, la API responde 200 con la URL del
 * intento en texto plano (aunque el Content-Type diga text/html).
 *
 * Con firma inválida responde 302 hacia .../secure/payment-intent/ con el ID
 * VACÍO — no hay JSON de error. Por eso la única forma fiable de distinguir
 * éxito de fracaso es exigir status 200 + que el cuerpo calce con esta forma.
 */
const INTENT_URL_PATTERN = /^https:\/\/\S+\/secure\/payment-intent\/[A-Za-z0-9]+$/;

/** El comprador no puede quedarse esperando una pasarela que no responde. */
const TIMEOUT_MS = 10_000;

export async function createPaymentIntent(
  args: CreatePaymentIntentArgs,
): Promise<PaymentIntentResult> {
  const config = getTuuConfig();

  if (!Number.isInteger(args.amount) || args.amount <= 0) {
    throw new Error(`[tuu] Monto inválido: ${args.amount}. Debe ser un entero CLP mayor que 0.`);
  }

  const payload: TuuPaymentIntentInput = {
    x_account_id: config.accountId,
    x_amount: args.amount,
    x_currency: "CLP",
    x_customer_email: args.customer.email,
    x_customer_first_name: args.customer.firstName,
    x_customer_last_name: args.customer.lastName,
    x_customer_phone: args.customer.phone,
    x_reference: args.reference,
    x_shop_name: config.shopName,
    x_url_callback: `${config.siteUrl}/api/tuu/callback`,
    // ⚠️ Las URLs de retorno van SIN query string. Verificado en QA: TUU pega
    // sus parámetros con "?" en vez de "&", así que un `?ref=…` propio termina
    // como `?ref=ORD-123?x_account_id=622…` — el ref sale contaminado y el
    // primer parámetro de TUU se pierde. No hace falta igual: TUU devuelve
    // x_reference, que es el mismo valor.
    x_url_cancel: `${config.siteUrl}/pago/cancelado`,
    x_url_complete: `${config.siteUrl}/pago/exito`,
  };

  // El campo opcional se agrega ANTES de firmar: si se agregara después, la
  // firma quedaría calculada sobre un objeto distinto al que se envía.
  if (args.description !== undefined && args.description !== "") {
    payload.x_description = args.description;
  }

  const body = { ...payload, x_signature: await signPayload(payload, config.secretKey) };

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-REDIRECT": "false" },
    body: JSON.stringify(body),
    // Sin esto, un 302 por firma inválida se seguiría en silencio y
    // terminaríamos leyendo el HTML de la pasarela como si fuera la URL.
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = (await response.text()).trim();

  if (response.status !== 200 || !INTENT_URL_PATTERN.test(text)) {
    throw new Error(
      `[tuu] No se pudo crear el intento de pago (status ${response.status}). ` +
        `Revisa credenciales, firma y campos. Respuesta: ${text.slice(0, 300)}`,
    );
  }

  return { redirectUrl: text, reference: args.reference, amount: args.amount, env: config.env };
}
