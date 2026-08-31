/**
 * Tipos del contrato de TUU Pago Online (Haulmer).
 *
 * Todos los campos del protocolo llevan prefijo `x_`: no es capricho de
 * nomenclatura, es lo que define QUÉ entra en el cálculo de la firma. El
 * algoritmo toma exactamente las claves que empiezan con `x_`, así que
 * agregar un campo con otro prefijo lo deja fuera del HMAC.
 */

export type TuuEnvName = "qa" | "prod";

/** Campos que se envían al crear el intento de pago (antes de firmar). */
export interface TuuPaymentIntentInput {
  x_account_id: string;
  /** Entero en CLP. Sin decimales ni separadores: se firma como "19990". */
  x_amount: number;
  x_currency: "CLP";
  x_customer_email: string;
  x_customer_first_name: string;
  x_customer_last_name: string;
  /** Formato E.164 chileno: +56912345678 */
  x_customer_phone: string;
  x_description?: string;
  /** Único por orden. Es la clave con la que se casa el callback. */
  x_reference: string;
  x_shop_name: string;
  x_url_callback: string;
  x_url_cancel: string;
  x_url_complete: string;
  [key: string]: string | number | undefined;
}

/** Resultados posibles que informa TUU. */
export type TuuResult = "completed" | "failed" | "pending";

export function isTuuResult(value: string): value is TuuResult {
  return value === "completed" || value === "failed" || value === "pending";
}

/**
 * Parámetros que TUU devuelve en el callback POST y en las redirecciones GET.
 *
 * El índice abierto es deliberado: si TUU agrega un campo `x_` nuevo, tiene
 * que entrar igual al cálculo de la firma. Filtrar por una lista blanca de
 * campos conocidos haría que la verificación falle el día que lo agreguen.
 */
export interface TuuNotification {
  x_account_id: string;
  x_reference: string;
  x_amount: string;
  x_currency: string;
  x_result: string;
  x_timestamp: string;
  x_message?: string;
  x_signature: string;
  [key: string]: string | undefined;
}
