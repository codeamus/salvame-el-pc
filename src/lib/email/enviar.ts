import { Resend } from "resend";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * ENVÍO DE CORREO — SOLO SERVIDOR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La API key de Resend permite mandar correo en nombre del dominio del
 * cliente. Quien la tenga puede suplantar a la tienda ante cualquier
 * comprador, así que vive únicamente acá y nunca lleva prefijo PUBLIC_.
 *
 * Nada de lo que hay en este módulo lanza. Un correo que no sale no puede
 * tumbar el pago que ya se cobró ni perder el mensaje que alguien acaba de
 * escribir: se informa el fallo y quien llama decide, normalmente dejando el
 * registro pendiente para reintentar desde el panel.
 */

export type ResultadoEnvio =
  { readonly ok: true; readonly id: string } | { readonly ok: false; readonly motivo: string };

function leer(nombre: string): string | undefined {
  const valor = process.env[nombre];
  return valor !== undefined && valor !== "" ? valor : undefined;
}

/**
 * Tope para no dejar colgada a una función serverless.
 *
 * Importa sobre todo en el callback de TUU, que tiene que responder en
 * menos de ~5 segundos o la pasarela lo da por fallido y reintenta. Un
 * proveedor de correo lento no puede provocar que un pago confirmado se
 * reprocese.
 */
const TIMEOUT_MS = 4000;

export interface CorreoSaliente {
  readonly para: string;
  readonly asunto: string;
  readonly html: string;
  /** Para que "responder" en el correo de contacto le llegue a quien escribió. */
  readonly responderA?: string;
}

export async function enviarCorreo(correo: CorreoSaliente): Promise<ResultadoEnvio> {
  const apiKey = leer("RESEND_API_KEY");
  const remitente = leer("RESEND_FROM_EMAIL");

  if (apiKey === undefined || remitente === undefined) {
    // No es un error de programa: es configuración que falta. Se devuelve
    // como motivo para que quede en el log y en el panel, en vez de
    // reventar una compra por una variable de entorno.
    return { ok: false, motivo: "Faltan RESEND_API_KEY o RESEND_FROM_EMAIL en el deploy." };
  }

  try {
    const resend = new Resend(apiKey);

    const envio = await Promise.race([
      resend.emails.send({
        from: remitente,
        to: correo.para,
        subject: correo.asunto,
        html: correo.html,
        ...(correo.responderA === undefined ? {} : { replyTo: correo.responderA }),
      }),
      new Promise<never>((_, rechazar) =>
        setTimeout(() => rechazar(new Error("timeout")), TIMEOUT_MS),
      ),
    ]);

    if (envio.error !== null) {
      return { ok: false, motivo: envio.error.message };
    }
    if (envio.data === null) {
      return { ok: false, motivo: "Resend no devolvió un identificador de envío." };
    }

    return { ok: true, id: envio.data.id };
  } catch (error) {
    return { ok: false, motivo: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Escapa texto que va a parar dentro del HTML de un correo.
 *
 * El nombre y el mensaje del formulario de contacto los escribe cualquiera
 * desde internet. Sin escapar, quien quisiera podría meter marcado en el
 * correo que le llega al cliente — desde romper el diseño hasta poner un
 * enlace falso con aspecto legítimo.
 */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
