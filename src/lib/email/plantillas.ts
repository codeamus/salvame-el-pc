import { escaparHtml } from "./enviar";
import { formatCLP } from "@/lib/format";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * PLANTILLAS DE CORREO
 * ─────────────────────────────────────────────────────────────────────────
 *
 * HTML a mano, con estilos en línea y tablas. No es descuido: los clientes
 * de correo —Gmail, Outlook, Apple Mail— ignoran hojas de estilo externas,
 * muchos descartan lo que va en <style>, y el flexbox no existe para varios
 * de ellos. Lo que acá parece anticuado es lo único que se ve igual en todos.
 *
 * Todo lo que venga de fuera pasa por escaparHtml antes de entrar.
 */

const COLOR_TINTA = "#1e1b18";
const COLOR_CORAL = "#ff5a48";
const COLOR_CREMA = "#f6f1e7";

function envoltorio(contenido: string, nombreTienda: string): string {
  return `<!doctype html>
<html lang="es-CL">
<body style="margin:0;padding:0;background:${COLOR_CREMA};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${COLOR_TINTA};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR_CREMA};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${COLOR_TINTA};">
        <tr><td style="padding:24px 28px;border-bottom:1px solid ${COLOR_TINTA};">
          <span style="font-size:18px;font-weight:800;letter-spacing:-.02em;">${escaparHtml(nombreTienda)}</span>
        </td></tr>
        <tr><td style="padding:28px;">${contenido}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export interface LineaConfirmacion {
  readonly name: string;
  readonly quantity: number;
  readonly line_total_clp: number;
}

export interface DatosConfirmacion {
  readonly nombreTienda: string;
  readonly nombreComprador: string;
  readonly referencia: string;
  readonly lineas: readonly LineaConfirmacion[];
  readonly subtotalCLP: number;
  readonly envioCLP: number;
  readonly totalCLP: number;
  readonly entrega: string;
  readonly direccion: string | null;
  readonly urlSitio: string;
}

/**
 * Confirmación de compra.
 *
 * No es cortesía: la Ley 19.496 obliga a enviar confirmación ESCRITA de la
 * compra, y no hacerlo extiende el derecho a retracto de 10 a 90 días
 * corridos. Por eso lleva el detalle de lo comprado, el precio total con
 * despacho incluido, la forma de entrega y el enlace a los términos — que es
 * lo que la ley exige informar.
 */
export function confirmacionDePedido(datos: DatosConfirmacion): { asunto: string; html: string } {
  const filas = datos.lineas
    .map(
      (linea) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid rgba(30,27,24,.12);font-size:14px;">
            ${String(linea.quantity)}&times; ${escaparHtml(linea.name)}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid rgba(30,27,24,.12);font-size:14px;text-align:right;white-space:nowrap;">
            ${formatCLP(linea.line_total_clp)}
          </td>
        </tr>`,
    )
    .join("");

  const contenido = `
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${COLOR_CORAL};">
      Pedido confirmado
    </p>
    <h1 style="margin:0 0 16px;font-size:26px;line-height:1.15;font-weight:800;letter-spacing:-.03em;">
      ¡Gracias por tu compra${datos.nombreComprador === "" ? "" : `, ${escaparHtml(datos.nombreComprador.split(" ")[0] ?? "")}`}!
    </h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
      Recibimos tu pago y ya estamos preparando tu pedido. Guarda este correo:
      es el comprobante de lo que compraste.
    </p>

    <p style="margin:0 0 6px;font-size:13px;color:rgba(30,27,24,.6);">Número de pedido</p>
    <p style="margin:0 0 24px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;font-weight:700;">
      ${escaparHtml(datos.referencia)}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${filas}
      <tr>
        <td style="padding:10px 0 2px;font-size:14px;">Subtotal</td>
        <td style="padding:10px 0 2px;font-size:14px;text-align:right;">${formatCLP(datos.subtotalCLP)}</td>
      </tr>
      <tr>
        <td style="padding:2px 0;font-size:14px;">Despacho</td>
        <td style="padding:2px 0;font-size:14px;text-align:right;">
          ${datos.envioCLP === 0 ? "Gratis" : formatCLP(datos.envioCLP)}
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0 0;font-size:16px;font-weight:800;border-top:1px solid ${COLOR_TINTA};">Total pagado</td>
        <td style="padding:10px 0 0;font-size:16px;font-weight:800;text-align:right;border-top:1px solid ${COLOR_TINTA};">
          ${formatCLP(datos.totalCLP)}
        </td>
      </tr>
    </table>

    <p style="margin:0 0 6px;font-size:13px;color:rgba(30,27,24,.6);">Entrega</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.5;">
      ${escaparHtml(datos.entrega)}${datos.direccion === null ? "" : `<br>${escaparHtml(datos.direccion)}`}
    </p>

    <p style="margin:0;font-size:13px;line-height:1.6;color:rgba(30,27,24,.7);">
      Tienes <strong>10 días corridos</strong> desde que recibes el producto para
      retractarte, según el artículo 3° bis de la Ley 19.496. Las condiciones
      completas están en
      <a href="${escaparHtml(datos.urlSitio)}/terminos-y-condiciones" style="color:${COLOR_TINTA};">
        nuestros términos y condiciones</a>.
    </p>`;

  return {
    asunto: `Confirmamos tu pedido ${datos.referencia} — ${datos.nombreTienda}`,
    html: envoltorio(contenido, datos.nombreTienda),
  };
}

export interface DatosContacto {
  readonly nombreTienda: string;
  readonly nombre: string;
  readonly correo: string;
  readonly asunto: string;
  readonly mensaje: string;
}

/** Aviso a la tienda de que alguien escribió por el formulario. */
export function avisoDeContacto(datos: DatosContacto): { asunto: string; html: string } {
  const contenido = `
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${COLOR_CORAL};">
      Mensaje del sitio
    </p>
    <h1 style="margin:0 0 20px;font-size:22px;line-height:1.2;font-weight:800;letter-spacing:-.02em;">
      ${escaparHtml(datos.asunto === "" ? "Consulta" : datos.asunto)}
    </h1>

    <p style="margin:0 0 4px;font-size:14px;"><strong>${escaparHtml(datos.nombre)}</strong></p>
    <p style="margin:0 0 20px;font-size:14px;">
      <a href="mailto:${escaparHtml(datos.correo)}" style="color:${COLOR_TINTA};">
        ${escaparHtml(datos.correo)}</a>
    </p>

    <div style="padding:16px;background:${COLOR_CREMA};border-left:3px solid ${COLOR_CORAL};font-size:14px;line-height:1.6;white-space:pre-wrap;">${escaparHtml(datos.mensaje)}</div>

    <p style="margin:20px 0 0;font-size:13px;color:rgba(30,27,24,.6);">
      Puedes responder directamente a este correo: le llega a quien escribió.
    </p>`;

  return {
    // El nombre va en el asunto para poder buscarlo después en la bandeja.
    asunto: `Contacto: ${datos.asunto === "" ? "consulta" : datos.asunto} — ${datos.nombre}`,
    html: envoltorio(contenido, datos.nombreTienda),
  };
}
