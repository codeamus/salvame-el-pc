/**
 * Validadores y formateadores de datos chilenos (RUT, teléfono, correo).
 *
 * Se separan del componente de checkout a propósito: son reglas de negocio
 * puras — entra un string, sale un booleano o un string normalizado — así
 * que se testean sin montar React y se reusan tal cual cuando exista el
 * formulario de contacto o el panel de administración.
 *
 * Convención de nombres: `clean*` deja el valor crudo comparable, `format*`
 * lo deja legible para el usuario, `isValid*` decide si se puede enviar.
 */

/* ── RUT ────────────────────────────────────────────────────────────── */

/**
 * Deja el RUT en su forma canónica: solo dígitos + dígito verificador en
 * mayúscula, sin puntos ni guion. "12.345.678-k" → "12345678K".
 */
export function cleanRut(value: string): string {
  return value.replace(/[^0-9kK]/g, "").toUpperCase();
}

/**
 * Calcula el dígito verificador de un cuerpo de RUT con el algoritmo
 * módulo 11 (serie multiplicadora 2,3,4,5,6,7 que se recicla).
 */
export function computeRutDv(body: string): string {
  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  if (remainder === 11) return "0";
  if (remainder === 10) return "K";
  return String(remainder);
}

/**
 * Formatea progresivamente mientras el usuario escribe: el último carácter
 * siempre es el dígito verificador y el cuerpo se puntea de a tres desde la
 * derecha. "123456789" → "12.345.678-9", "1234" → "123-4".
 *
 * Es progresivo (y no un formateo final) para que el campo se vea correcto
 * en todo momento y el usuario no tenga que escribir los puntos a mano.
 */
export function formatRut(value: string): string {
  const clean = cleanRut(value).slice(0, 9);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean;

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const dotted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${dotted}-${dv}`;
}

/**
 * Un RUT es válido si tiene entre 7 y 8 dígitos de cuerpo (rango real de
 * RUN de personas y de RUT de empresas en Chile) y su dígito verificador
 * coincide con el que calcula el módulo 11.
 */
export function isValidRut(value: string): boolean {
  const clean = cleanRut(value);
  if (!/^\d{7,8}[0-9K]$/.test(clean)) return false;

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);

  return computeRutDv(body) === dv;
}

/* ── Teléfono ───────────────────────────────────────────────────────── */

/**
 * Extrae los 9 dígitos nacionales. "+56 9 5724 3741" → "957243741".
 *
 * El prefijo país solo se descarta cuando viene declarado ("+56", "0056") o
 * cuando sobran dígitos para ser un número nacional. No se puede sacar a
 * ciegas todo "56" inicial: 51, 52, 53, 55, 57 y 58 son códigos de área
 * reales, así que "56 12 34 56" bien podría ser un fijo de La Serena.
 */
export function cleanPhone(value: string): string {
  const raw = value.trim();
  let digits = raw.replace(/\D/g, "");

  if (digits.startsWith("0056")) digits = digits.slice(4);
  else if (raw.startsWith("+") && digits.startsWith("56")) digits = digits.slice(2);
  else if (digits.length > 9 && digits.startsWith("56")) digits = digits.slice(2);

  return digits.slice(0, 9);
}

/**
 * Formatea la parte nacional: "957243741" → "9 5724 3741".
 *
 * A propósito NO incluye el "+56": ese prefijo se dibuja fijo al lado del
 * campo, fuera del input. Si se autocompletara dentro, el "+56" impreso y el
 * "+56" que escribe el usuario serían indistinguibles al releer el valor, y
 * el número terminaría corriéndose un par de dígitos.
 */
export function formatPhone(value: string): string {
  const digits = cleanPhone(value);
  if (digits.length === 0) return "";

  const parts = [digits.slice(0, 1)];
  if (digits.length > 1) parts.push(digits.slice(1, 5));
  if (digits.length > 5) parts.push(digits.slice(5, 9));

  return parts.join(" ");
}

/** Con prefijo país, para mostrar el número ya guardado: "+56 9 5724 3741". */
export function formatPhoneInternational(value: string): string {
  const national = formatPhone(value);
  return national === "" ? "" : `+56 ${national}`;
}

/**
 * Válido = 9 dígitos nacionales que empiezan en 2-9: móviles (9XXXXXXXX) y
 * fijos (2 en Santiago, 3-7 en regiones). Se rechaza el 1 y el 0 iniciales
 * porque son servicios y prefijos de larga distancia, no números de destino.
 */
export function isValidPhone(value: string): boolean {
  return /^[2-9]\d{8}$/.test(cleanPhone(value));
}

/** `true` si el número es un móvil (empieza en 9): el que sirve para WhatsApp. */
export function isMobilePhone(value: string): boolean {
  return /^9\d{8}$/.test(cleanPhone(value));
}

/** Forma E.164, la que espera un backend o una pasarela: "+56957243741". */
export function toE164Phone(value: string): string {
  return `+56${cleanPhone(value)}`;
}

/* ── Correo y nombre ────────────────────────────────────────────────── */

/**
 * Regex deliberadamente simple: exige `algo@algo.tld` sin espacios y con TLD
 * de al menos dos letras. No se intenta implementar el RFC 5322 — un correo
 * escrito mal pero sintácticamente válido igual rebota al enviar, así que la
 * validación de acá solo atrapa los errores de tipeo evidentes.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-zA-Z]{2,}$/;

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length <= 254 && EMAIL_PATTERN.test(trimmed);
}

/**
 * Nombre y apellido: al menos dos palabras de dos letras, solo letras
 * (con tildes y ñ), apóstrofes y guiones. Bloquea el "asdf" y el "123".
 */
export function isValidFullName(value: string): boolean {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < 5 || trimmed.length > 80) return false;

  return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ']{2,}(?:[- ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ']{2,})+$/.test(trimmed);
}

/** Colapsa espacios múltiples y recorta: "  Ana   Soto " → "Ana Soto". */
export function normalizeSpaces(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Dirección: tiene que traer un número, si no el repartidor no llega.
 * "Av. Providencia 1234" pasa, "Av. Providencia" no.
 */
export function isValidStreetAddress(value: string): boolean {
  const trimmed = normalizeSpaces(value);
  return trimmed.length >= 5 && trimmed.length <= 120 && /\d/.test(trimmed);
}
