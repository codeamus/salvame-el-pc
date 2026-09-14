/**
 * ─────────────────────────────────────────────────────────────────────────
 * FORMULARIO DE CONTACTO — validación del servidor
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Corre en el servidor aunque el navegador ya haya validado, por el mismo
 * motivo que en el checkout: la validación del cliente se salta con un fetch
 * a mano. Acá el riesgo no es un cobro mal calculado sino un buzón lleno de
 * basura, que es igual de efectivo para que nadie lea los mensajes reales.
 */

export interface MensajeContacto {
  readonly nombre: string;
  readonly correo: string;
  readonly asunto: string;
  readonly mensaje: string;
}

export type ResultadoContacto =
  | { readonly ok: true; readonly mensaje: MensajeContacto }
  /** `descartar` = se responde como si hubiera salido bien, pero no se guarda. */
  | { readonly ok: false; readonly error: string; readonly descartar?: boolean };

const MAX_NOMBRE = 80;
const MAX_ASUNTO = 120;
const MAX_MENSAJE = 4000;

/** Mismo criterio que el checkout: algo@algo.algo, sin pretender validar RFC. */
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

export function parseMensajeContacto(cuerpo: unknown): ResultadoContacto {
  if (typeof cuerpo !== "object" || cuerpo === null) {
    return { ok: false, error: "No pudimos leer el mensaje." };
  }

  const datos = cuerpo as Record<string, unknown>;

  /*
   * Trampa para bots: un campo que el formulario esconde y que una persona
   * nunca llena. Si viene con algo, es un robot rellenando todo lo que
   * encuentra.
   *
   * Se responde como si el envío hubiera funcionado, en vez de rechazarlo.
   * Un error le enseña al bot que lo detectaron y que conviene reintentar
   * de otra forma; un "gracias" lo deja creyendo que ya está.
   */
  if (texto(datos.sitio_web) !== "") {
    return { ok: false, error: "", descartar: true };
  }

  const nombre = texto(datos.nombre);
  if (nombre === "") return { ok: false, error: "Escribe tu nombre." };
  if (nombre.length > MAX_NOMBRE) return { ok: false, error: "El nombre es demasiado largo." };

  const correo = texto(datos.correo).toLowerCase();
  if (correo === "") return { ok: false, error: "Escribe tu correo." };
  if (!CORREO.test(correo)) return { ok: false, error: "Ese correo no parece válido." };

  const mensaje = texto(datos.mensaje);
  if (mensaje === "") return { ok: false, error: "Escribe tu mensaje." };
  if (mensaje.length > MAX_MENSAJE) {
    return { ok: false, error: "El mensaje es demasiado largo. Resúmelo un poco." };
  }

  const asunto = texto(datos.asunto).slice(0, MAX_ASUNTO);

  return { ok: true, mensaje: { nombre, correo, asunto, mensaje } };
}
