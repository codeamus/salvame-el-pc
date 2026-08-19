/**
 * Reglas del formulario de checkout: forma de los datos, validación campo a
 * campo y mensajes de error.
 *
 * Está fuera del componente para que la validación sea testeable sin React y
 * para que el día que exista el endpoint /api/checkout el servidor pueda
 * correr exactamente las mismas reglas — la validación de cliente es una
 * cortesía para el usuario, no una garantía, y duplicar los mensajes en dos
 * lugares es como se desincronizan.
 */

import { isCommuneOf, isRegion } from "@/lib/chile-geo";
import {
  isValidEmail,
  isValidFullName,
  isValidPhone,
  isValidRut,
  isValidStreetAddress,
  normalizeSpaces,
  toE164Phone,
} from "@/lib/validation";

/**
 * Cómo recibe el pedido el cliente.
 *
 *   - "despacho": va a una dirección, así que hay que pedirla completa.
 *   - "acordar":  se coordina el punto y la hora por teléfono. No se pide
 *     dirección, porque todavía no existe: se define conversando.
 */
export const DELIVERY_METHODS = ["despacho", "acordar"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export function isDeliveryMethod(value: string): value is DeliveryMethod {
  return (DELIVERY_METHODS as readonly string[]).includes(value);
}

export interface CheckoutForm {
  entrega: DeliveryMethod;
  nombre: string;
  rut: string;
  correo: string;
  telefono: string;
  region: string;
  comuna: string;
  calle: string;
  referencia: string;
}

export type CheckoutField = keyof CheckoutForm;

/** Campos en el orden en que aparecen: define a cuál se enfoca al fallar. */
export const CHECKOUT_FIELDS: readonly CheckoutField[] = [
  "entrega",
  "nombre",
  "rut",
  "correo",
  "telefono",
  "region",
  "comuna",
  "calle",
  "referencia",
];

/** Campos de dirección: solo se piden (y se validan) si hay despacho. */
export const ADDRESS_FIELDS: readonly CheckoutField[] = ["region", "comuna", "calle", "referencia"];

export const EMPTY_CHECKOUT_FORM: CheckoutForm = {
  // Se parte en despacho: es el caso más común y el que necesita más datos,
  // así que el formulario se muestra completo y elegir "acordar" lo acorta.
  entrega: "despacho",
  nombre: "",
  rut: "",
  correo: "",
  telefono: "",
  region: "",
  comuna: "",
  calle: "",
  referencia: "",
};

export type CheckoutErrors = Partial<Record<CheckoutField, string>>;

/**
 * Valida un campo. Devuelve el mensaje de error o `undefined` si está bien.
 *
 * Recibe el formulario completo porque la comuna no se puede juzgar sola:
 * depende de qué región eligió el usuario.
 */
export function validateField(field: CheckoutField, form: CheckoutForm): string | undefined {
  // Sin despacho no hay dirección que validar: los campos ni se muestran.
  if (form.entrega !== "despacho" && ADDRESS_FIELDS.includes(field)) return undefined;

  const value = form[field].trim();

  switch (field) {
    case "entrega":
      if (!isDeliveryMethod(value)) return "Elige cómo quieres recibir tu pedido.";
      return undefined;

    case "nombre":
      if (value === "") return "Escribe tu nombre y apellido.";
      if (!isValidFullName(value)) return "Necesitamos nombre y apellido, solo letras.";
      return undefined;

    case "rut":
      if (value === "") return "Escribe tu RUT.";
      if (!isValidRut(value)) return "Ese RUT no es válido. Revisa el dígito verificador.";
      return undefined;

    case "correo":
      if (value === "") return "Escribe tu correo electrónico.";
      if (!isValidEmail(value)) return "Ese correo no tiene un formato válido.";
      return undefined;

    case "telefono":
      if (value === "") return "Escribe tu teléfono.";
      if (!isValidPhone(value)) return "Usa un número chileno de 9 dígitos: +56 9 5724 3741.";
      return undefined;

    case "region":
      if (value === "") return "Elige tu región.";
      if (!isRegion(value)) return "Elige una región de la lista.";
      return undefined;

    case "comuna":
      if (form.region.trim() === "") return "Primero elige tu región.";
      if (value === "") return "Elige tu comuna.";
      if (!isCommuneOf(form.region.trim(), value))
        return "Esa comuna no pertenece a la región elegida.";
      return undefined;

    case "calle":
      if (value === "") return "Escribe tu calle y número.";
      if (!isValidStreetAddress(value)) return "Incluye el número de la dirección.";
      return undefined;

    case "referencia":
      // Opcional: solo se acota el largo para no reventar la etiqueta de envío.
      if (value.length > 120) return "Máximo 120 caracteres.";
      return undefined;
  }
}

/** Valida todo el formulario. Objeto vacío = listo para pagar. */
export function validateCheckout(form: CheckoutForm): CheckoutErrors {
  const errors: CheckoutErrors = {};

  for (const field of CHECKOUT_FIELDS) {
    const error = validateField(field, form);
    if (error !== undefined) errors[field] = error;
  }

  return errors;
}

export function isCheckoutValid(form: CheckoutForm): boolean {
  return Object.keys(validateCheckout(form)).length === 0;
}

/**
 * Datos ya normalizados, listos para mandar al backend: espacios colapsados,
 * teléfono en E.164 y RUT tal cual lo ve el usuario (con puntos y guion, que
 * es el formato con el que se emite una boleta en Chile).
 */
export interface CheckoutPayload {
  readonly entrega: DeliveryMethod;
  readonly nombre: string;
  readonly rut: string;
  readonly correo: string;
  readonly telefono: string;
  /** Solo con entrega "despacho". Con "acordar" viene en null. */
  readonly direccion: {
    readonly region: string;
    readonly comuna: string;
    readonly calle: string;
    readonly referencia: string;
  } | null;
}

export function toCheckoutPayload(form: CheckoutForm): CheckoutPayload {
  return {
    entrega: form.entrega,
    nombre: normalizeSpaces(form.nombre),
    rut: form.rut.trim(),
    correo: form.correo.trim().toLowerCase(),
    telefono: toE164Phone(form.telefono),
    // La dirección va en null y no en strings vacíos: así el backend no
    // puede confundir "no corresponde" con "se les olvidó llenarla".
    direccion:
      form.entrega === "despacho"
        ? {
            region: form.region,
            comuna: form.comuna,
            calle: normalizeSpaces(form.calle),
            referencia: normalizeSpaces(form.referencia),
          }
        : null,
  };
}

/**
 * Costo de envío según la forma de entrega. Acordar la entrega no cuesta:
 * el punto se define en conjunto, no hay repartidor de por medio.
 */
export function shippingForMethod(method: DeliveryMethod, cartShipping: number): number {
  return method === "despacho" ? cartShipping : 0;
}
