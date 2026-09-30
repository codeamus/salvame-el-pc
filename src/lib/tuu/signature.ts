/**
 * ─────────────────────────────────────────────────────────────────────────
 * FIRMA HMAC-SHA256 DE TUU / HAULMER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * El mismo algoritmo sirve para firmar lo que enviamos y para verificar lo
 * que TUU nos manda de vuelta:
 *
 *   1. Tomar solo las claves que empiezan con "x_", excluyendo "x_signature".
 *   2. Ordenarlas alfabéticamente (ASCII, case-sensitive).
 *   3. Concatenar clave+valor SIN separadores. Valor vacío ⇒ solo la clave.
 *   4. HMAC-SHA256 con la secret key, salida hex en minúsculas (64 chars).
 *
 * Tres trampas que cuestan un día si no se saben:
 *
 *   · El ejemplo de PHP de la documentación de TUU NO reproduce el hash que
 *     muestra — su array de ejemplo viene recortado con un "// ... otros
 *     campos". No sirve como test de referencia; el algoritmo sí es correcto
 *     y la API de QA lo acepta.
 *   · El monto se firma como string sin formato: 19990 ⇒ "x_amount19990".
 *     Si en algún punto se serializa como 19990.0 o "19.990", la firma deja
 *     de calzar. Por eso PriceCLP es entero y el cliente lo verifica.
 *   · La firma se calcula sobre el objeto EXACTO que se serializa. Agregar,
 *     quitar o normalizar un campo después de firmar la invalida.
 *
 * Se usa Web Crypto (crypto.subtle) y no node:crypto para que el mismo
 * código corra en el runtime Node y en el Edge de Vercel.
 */

/** Cadena base que se firma. Exportada porque es lo primero que se mira cuando una firma no calza. */
export function buildSignatureBase(data: Record<string, unknown>): string {
  return Object.keys(data)
    .filter((key) => key.startsWith("x_") && key !== "x_signature")
    .filter((key) => data[key] !== undefined && data[key] !== null)
    .sort()
    .map((key) => key + String(data[key]))
    .join("");
}

export async function signPayload(
  data: Record<string, unknown>,
  secretKey: string,
): Promise<string> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(buildSignatureBase(data)));

  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Comparación en tiempo constante.
 *
 * Un `===` normal corta en el primer byte distinto, y esa diferencia de
 * microsegundos permite ir adivinando la firma correcta carácter a carácter.
 * Acá siempre se recorre el string completo.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);

  return diff === 0;
}

export async function verifySignature(
  data: Record<string, unknown>,
  receivedSignature: string,
  secretKey: string,
): Promise<boolean> {
  const expected = await signPayload(data, secretKey);
  return safeEqual(expected, receivedSignature.trim().toLowerCase());
}
