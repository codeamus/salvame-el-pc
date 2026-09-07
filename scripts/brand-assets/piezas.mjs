/**
 * Definición de cada pieza del kit. Una pieza es HTML + CSS plano; el
 * render a PDF/PNG lo hace build.mjs con Chromium.
 *
 * Dos familias:
 *   · tipo "impreso"  → lleva medidas en mm y sangrado. Sale PDF (vector,
 *     con la fuente embebida) para la imprenta + PNG a 300 dpi de preview.
 *   · tipo "pantalla" → medidas en px. Sale PNG al tamaño exacto que pide
 *     la red social.
 *
 * El sangrado (3 mm por lado) es obligatorio en todo lo que tenga fondo de
 * color: la guillotina nunca corta exacto, y sin sangrado quedan hilos
 * blancos en el borde. La página del PDF ya viene con el sangrado sumado,
 * así que el corte final está SIEMPRE a 3 mm de cada borde de la página.
 */

import { C, NEGOCIO, logo, isotipo, micro } from "./marca.mjs";

const MM = 3.779527559; // 1 mm en px CSS a 96 dpi
export const mm = (n) => n * MM;

const SANGRADO = 3;

/* ── Envoltorio ───────────────────────────────────────────────────────── */

function pagina({ ancho, alto, fondo, cuerpo, extraCss = "", cssFuentes }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${cssFuentes}
@page{size:${ancho} ${alto};margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${ancho};height:${alto};overflow:hidden}
body{position:relative;background:${fondo};display:flex;align-items:center;justify-content:center;
  -webkit-font-smoothing:antialiased;font-family:"Manrope",sans-serif;color:${C.tinta}}
.pila{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
${extraCss}
</style></head><body>${cuerpo}</body></html>`;
}

/** Rayas diagonales coral — el gesto de "cuidado" de las cajas. */
function rayas(color = C.coral, paso = 8, grosor = 4) {
  return `repeating-linear-gradient(-45deg,${color} 0 ${grosor}px,transparent ${grosor}px ${paso}px)`;
}

/* ── Piezas ───────────────────────────────────────────────────────────── */

export function construirPiezas({ cssFuentes, qr }) {
  const p = (o) => ({ ...o, cssFuentes });

  /* Ancho/alto totales de un impreso = corte + sangrado a cada lado. */
  const totalMm = (corte) => corte + SANGRADO * 2;

  return [
    /* ═══ STICKERS DE ENVÍO ═══════════════════════════════════════════ */

    p({
      id: "sticker-01-logo-50mm",
      grupo: "stickers",
      tipo: "impreso",
      corte: { ancho: 50, alto: 50, forma: "círculo Ø50 mm" },
      nota: "Sticker principal de marca. Troquel circular.",
      html: pagina({
        cssFuentes,
        ancho: `${totalMm(50)}mm`,
        alto: `${totalMm(50)}mm`,
        fondo: C.tinta,
        cuerpo: `<div class="pila" style="gap:${mm(2.6)}px">
          ${isotipo({ trazo: C.crema, chip: C.coral, pulso: C.coral, fondo: C.tinta, tamano: mm(17) })}
          <span style="font-family:'Chakra Petch';font-weight:700;font-size:${mm(4.6)}px;line-height:1.05;letter-spacing:-.02em;color:${C.crema}">
            Sálvame<br><span style="color:${C.coral}">el PC</span>
          </span>
          <span style="width:${mm(10)}px;height:${mm(0.5)}px;background:${C.coral}"></span>
          ${micro(NEGOCIO.sitio, { color: C.crema, tamano: mm(1.9) })}
        </div>`,
      }),
    }),

    p({
      id: "sticker-02-gracias-50mm",
      grupo: "stickers",
      tipo: "impreso",
      corte: { ancho: 50, alto: 50, forma: "círculo Ø50 mm" },
      nota: "El que pidió el cliente: cierra la caja y dice gracias. Troquel circular.",
      html: pagina({
        cssFuentes,
        ancho: `${totalMm(50)}mm`,
        alto: `${totalMm(50)}mm`,
        fondo: C.coral,
        cuerpo: `<div class="pila" style="gap:${mm(2.2)}px">
          ${isotipo({ trazo: C.tinta, chip: C.tinta, pulso: C.tinta, fondo: C.coral, tamano: mm(11) })}
          <span style="font-family:'Manrope';font-weight:800;font-size:${mm(5.4)}px;line-height:.98;letter-spacing:-.045em;text-transform:uppercase">
            ¡Gracias<br>por tu<br>compra!
          </span>
          ${micro(`${NEGOCIO.nombre} · santiago`, { tamano: mm(1.8) })}
        </div>`,
      }),
    }),

    p({
      id: "sticker-03-fragil-70x40mm",
      grupo: "stickers",
      tipo: "impreso",
      corte: { ancho: 70, alto: 40, forma: "rectángulo 70 × 40 mm, esquinas redondeadas 3 mm" },
      nota: "Va en el exterior de la caja, bien visible. Ideal en papel blanco brillante.",
      html: pagina({
        cssFuentes,
        ancho: `${totalMm(70)}mm`,
        alto: `${totalMm(40)}mm`,
        fondo: C.crema,
        cuerpo: `<div style="position:absolute;inset:0;display:flex;flex-direction:column">
            <div style="height:${mm(8)}px;background:${rayas()}"></div>
            <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:${mm(4)}px;padding:0 ${mm(6)}px">
              ${isotipo({ trazo: C.tinta, chip: C.coral, pulso: C.coral, fondo: C.crema, tamano: mm(13) })}
              <div style="text-align:left">
                <div style="font-family:'Manrope';font-weight:800;font-size:${mm(9)}px;line-height:.9;letter-spacing:-.05em;text-transform:uppercase">Frágil</div>
                <div style="margin-top:${mm(1.4)}px">${micro("manipular con cuidado", { tamano: mm(2.1) })}</div>
                <div style="margin-top:${mm(0.8)}px">${micro(NEGOCIO.sitio, { color: C.coral, tamano: mm(2.1) })}</div>
              </div>
            </div>
            <div style="height:${mm(8)}px;background:${rayas()}"></div>
          </div>`,
      }),
    }),

    p({
      id: "sticker-04-precinto-90x25mm",
      grupo: "stickers",
      tipo: "impreso",
      corte: { ancho: 90, alto: 25, forma: "rectángulo 90 × 25 mm" },
      nota: "Precinto: se pega cruzando la solapa de la caja. Si alguien la abre, se nota.",
      html: pagina({
        cssFuentes,
        ancho: `${totalMm(90)}mm`,
        alto: `${totalMm(25)}mm`,
        fondo: C.tinta,
        cuerpo: `<div style="position:absolute;inset:0;display:flex;flex-direction:column">
            <div style="height:${mm(6)}px;background:${rayas(C.coral, mm(3), mm(1.5))}"></div>
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${mm(1.6)}px">
              ${logo({ trazo: C.crema, chip: C.coral, pulso: C.coral, fondo: C.tinta, acento: C.coral, tamano: mm(8) })}
              ${micro("sellado en origen · no recibir si viene abierto", { color: C.crema, tamano: mm(1.7) })}
            </div>
            <div style="height:${mm(6)}px;background:${rayas(C.coral, mm(3), mm(1.5))}"></div>
          </div>`,
      }),
    }),

    p({
      id: "sticker-05-revisado-40mm",
      grupo: "stickers",
      tipo: "impreso",
      corte: { ancho: 40, alto: 40, forma: "círculo Ø40 mm" },
      nota: "Sello de control de calidad para el producto o la boleta. La línea es para escribir la fecha a mano.",
      html: pagina({
        cssFuentes,
        ancho: `${totalMm(40)}mm`,
        alto: `${totalMm(40)}mm`,
        fondo: C.crema,
        cuerpo: `<div style="width:${mm(33)}px;height:${mm(33)}px;border:${mm(0.9)}px solid ${C.tinta};border-radius:50%;display:flex;align-items:center;justify-content:center">
            <div class="pila" style="gap:${mm(1.4)}px">
              ${isotipo({ trazo: C.tinta, chip: C.coral, pulso: C.coral, fondo: C.crema, tamano: mm(8) })}
              <span style="font-family:'Manrope';font-weight:800;font-size:${mm(4.1)}px;line-height:1;letter-spacing:-.02em;text-transform:uppercase">Probado<br>y revisado</span>
              <span style="width:${mm(16)}px;border-bottom:${mm(0.3)}px solid ${C.tinta};height:${mm(2.6)}px"></span>
              ${micro("fecha", { tamano: mm(1.7), color: "rgba(30,27,24,.55)" })}
            </div>
          </div>`,
      }),
    }),

    /* ═══ TARJETA DE AGRADECIMIENTO ═══════════════════════════════════ */

    p({
      id: "tarjeta-06-gracias-frente-90x50mm",
      grupo: "tarjeta",
      tipo: "impreso",
      corte: { ancho: 90, alto: 50, forma: "rectángulo 90 × 50 mm (tamaño tarjeta)" },
      nota: "Cara A. Imprimir junto con la cara B, tiro y retiro, en cartulina 300 g.",
      html: pagina({
        cssFuentes,
        ancho: `${totalMm(90)}mm`,
        alto: `${totalMm(50)}mm`,
        fondo: C.tinta,
        cuerpo: `<div class="pila" style="gap:${mm(3)}px">
            ${logo({ trazo: C.crema, chip: C.coral, pulso: C.coral, fondo: C.tinta, acento: C.coral, tamano: mm(13) })}
            <span style="width:${mm(14)}px;height:${mm(0.6)}px;background:${C.coral}"></span>
            ${micro(NEGOCIO.tagline.toLowerCase(), { color: C.crema, tamano: mm(2.2) })}
          </div>`,
      }),
    }),

    p({
      id: "tarjeta-07-gracias-reverso-90x50mm",
      grupo: "tarjeta",
      tipo: "impreso",
      corte: { ancho: 90, alto: 50, forma: "rectángulo 90 × 50 mm (tamaño tarjeta)" },
      nota: "Cara B. El QR lleva a salvameelpc.cl.",
      html: pagina({
        cssFuentes,
        ancho: `${totalMm(90)}mm`,
        alto: `${totalMm(50)}mm`,
        fondo: C.crema,
        cuerpo: `<div style="display:flex;align-items:center;gap:${mm(5)}px;padding:0 ${mm(7)}px;width:100%">
            <div style="flex:1;text-align:left">
              <div style="font-family:'Manrope';font-weight:800;font-size:${mm(5.2)}px;line-height:.98;letter-spacing:-.045em">
                ¡Gracias por<br>comprar en<br><span style="color:${C.coral}">Sálvame el PC!</span>
              </div>
              <div style="margin-top:${mm(2.2)}px;font-size:${mm(2.3)}px;line-height:1.35;color:rgba(30,27,24,.7)">
                Cualquier duda con tu equipo, escribinos. Te respondemos nosotros, no un bot.
              </div>
              <div style="margin-top:${mm(3)}px;display:flex;gap:${mm(2.5)}px;align-items:center">
                ${micro(NEGOCIO.whatsapp, { tamano: mm(1.9) })}
                <span style="width:${mm(0.6)}px;height:${mm(0.6)}px;background:${C.coral}"></span>
                ${micro(NEGOCIO.instagram, { tamano: mm(1.9) })}
              </div>
            </div>
            <div class="pila" style="gap:${mm(1.4)}px">
              <div style="width:${mm(19)}px;height:${mm(19)}px">${qr.sitio}</div>
              ${micro(NEGOCIO.sitio, { tamano: mm(1.8) })}
            </div>
          </div>`,
      }),
    }),

    /* ═══ INSERTO A6 ══════════════════════════════════════════════════ */

    p({
      id: "inserto-08-gracias-A6",
      grupo: "inserto",
      tipo: "impreso",
      corte: { ancho: 105, alto: 148, forma: "A6 · 105 × 148 mm" },
      nota: "La pieza grande de agradecimiento que va adentro de la caja. Cartulina 250–300 g.",
      html: pagina({
        cssFuentes,
        ancho: `${totalMm(105)}mm`,
        alto: `${totalMm(148)}mm`,
        fondo: C.crema,
        cuerpo: `<div style="position:absolute;inset:0;display:flex;flex-direction:column">
            <div style="height:${mm(8)}px;background:${rayas(C.coral, mm(3), mm(1.5))};flex:none"></div>

            <div style="flex:1;padding:${mm(7)}px ${mm(10)}px ${mm(5)}px;display:flex;flex-direction:column">
              ${logo({ trazo: C.tinta, chip: C.coral, pulso: C.coral, fondo: C.crema, acento: C.coral, tamano: mm(10) })}

              <div style="margin-top:${mm(6)}px;font-family:'Manrope';font-weight:800;font-size:${mm(8.8)}px;line-height:.94;letter-spacing:-.05em">
                ¡Gracias por<br>comprar en<br><span style="color:${C.coral}">Sálvame el PC!</span>
              </div>

              <div style="margin-top:${mm(5)}px;font-size:${mm(3.1)}px;line-height:1.5;color:rgba(30,27,24,.72);max-width:${mm(74)}px">
                Tu pedido salió revisado y embalado a mano. Si algo llegó mal, no te compliques:
                escribinos y lo solucionamos.
              </div>

              <div style="margin-top:${mm(6)}px;margin-bottom:${mm(6)}px;display:flex;flex-direction:column;gap:${mm(3)}px">
                ${[
                  // Lo que dice el impreso tiene que decir lo mismo que
                  // /terminos-y-condiciones y /servicio-tecnico. El plazo es
                  // la garantía LEGAL de la Ley 19.496 —no un beneficio
                  // propio— y el diagnóstico tiene precio publicado: si el
                  // papel promete otra cosa, esa es la que vale ante el
                  // SERNAC.
                  ["Garantía legal", "6 meses en todos los productos"],
                  ["Soporte", "Te atiende una persona, no un bot"],
                  ["Servicio técnico", "Diagnóstico en 24 horas"],
                ]
                  .map(
                    ([t, d]) => `<div style="display:flex;align-items:baseline;gap:${mm(2.5)}px">
                      <span style="width:${mm(1.8)}px;height:${mm(1.8)}px;background:${C.coral};flex:none;transform:translateY(${mm(-0.2)}px)"></span>
                      <div style="text-align:left">
                        <span style="font-weight:800;font-size:${mm(3.2)}px;letter-spacing:-.02em">${t}</span>
                        <span style="font-size:${mm(2.9)}px;color:rgba(30,27,24,.62)"> — ${d}</span>
                      </div>
                    </div>`,
                  )
                  .join("")}
              </div>

              <div style="margin-top:auto;display:flex;align-items:center;gap:${mm(4.5)}px;border-top:${mm(0.4)}px solid ${C.tinta};padding-top:${mm(5)}px">
                <div style="width:${mm(24)}px;height:${mm(24)}px;flex:none">${qr.sitio}</div>
                <div style="text-align:left">
                  <div style="font-weight:800;font-size:${mm(3.4)}px;letter-spacing:-.03em;line-height:1.2">Volvé cuando quieras</div>
                  <div style="margin-top:${mm(1)}px;font-size:${mm(2.7)}px;line-height:1.45;color:rgba(30,27,24,.62)">
                    Escaneá y entrá a la tienda. Contanos qué te pareció: nos sirve más de lo que creés.
                  </div>
                </div>
              </div>
            </div>

            <div style="flex:none;background:${C.tinta};color:${C.crema};padding:${mm(4)}px ${mm(10)}px ${mm(7)}px;display:flex;justify-content:space-between;align-items:center">
              ${micro(NEGOCIO.sitio, { color: C.crema, tamano: mm(2.3) })}
              ${micro(NEGOCIO.instagram, { color: C.crema, tamano: mm(2.3) })}
              ${micro(NEGOCIO.whatsapp, { color: C.coral, tamano: mm(2.3) })}
            </div>
          </div>`,
      }),
    }),

    /* ═══ REDES SOCIALES ══════════════════════════════════════════════ */

    p({
      id: "redes-09-post-gracias-1080",
      grupo: "redes",
      tipo: "pantalla",
      px: { ancho: 1080, alto: 1080 },
      nota: "Post cuadrado de agradecimiento. Instagram / Facebook.",
      html: pagina({
        cssFuentes,
        ancho: "1080px",
        alto: "1080px",
        fondo: C.coral,
        cuerpo: `<div style="position:absolute;inset:0;padding:96px;display:flex;flex-direction:column">
            ${logo({ trazo: C.tinta, chip: C.tinta, pulso: C.tinta, fondo: C.coral, acento: C.tinta, tamano: 76 })}
            <div style="margin-top:auto;font-family:'Manrope';font-weight:800;font-size:132px;line-height:.9;letter-spacing:-.055em;text-transform:uppercase">
              ¡Gracias<br>por tu<br>compra!
            </div>
            <div style="margin-top:44px;font-size:34px;line-height:1.4;max-width:660px;color:rgba(30,27,24,.75)">
              Cada pedido sale revisado y embalado a mano. Gracias por confiar en nosotros.
            </div>
            <div style="margin-top:64px;display:inline-flex;align-self:flex-start;background:${C.tinta};color:${C.crema};padding:22px 34px">
              ${micro(NEGOCIO.sitio, { color: C.crema, tamano: 26 })}
            </div>
          </div>`,
      }),
    }),

    p({
      id: "redes-10-post-marca-1080",
      grupo: "redes",
      tipo: "pantalla",
      px: { ancho: 1080, alto: 1080 },
      nota: "Post de marca / presentación. Sirve de foto de perfil recortada al centro también.",
      html: pagina({
        cssFuentes,
        ancho: "1080px",
        alto: "1080px",
        fondo: C.tinta,
        cuerpo: `<div style="position:absolute;inset:0;display:flex;flex-direction:column">
            <div style="height:26px;background:${rayas(C.coral, 22, 11)}"></div>
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:48px">
              ${isotipo({ trazo: C.crema, chip: C.coral, pulso: C.coral, fondo: C.tinta, tamano: 300 })}
              <div style="text-align:center">
                <div style="font-family:'Chakra Petch';font-weight:700;font-size:96px;line-height:1;letter-spacing:-.02em;color:${C.crema}">
                  Sálvame <span style="color:${C.coral}">el PC</span>
                </div>
                <div style="margin-top:28px">${micro(NEGOCIO.tagline.toLowerCase(), { color: C.crema, tamano: 26 })}</div>
              </div>
            </div>
            <div style="background:${C.crema};padding:30px;text-align:center">
              ${micro(`${NEGOCIO.sitio} · ${NEGOCIO.instagram} · santiago, chile`, { tamano: 24 })}
            </div>
          </div>`,
      }),
    }),

    p({
      id: "redes-11-story-1080x1920",
      grupo: "redes",
      tipo: "pantalla",
      px: { ancho: 1080, alto: 1920 },
      nota: "Historia de Instagram / WhatsApp. El QR se puede tocar desde la historia si lo subís con sticker de link.",
      html: pagina({
        cssFuentes,
        ancho: "1080px",
        alto: "1920px",
        fondo: C.crema,
        cuerpo: `<div style="position:absolute;inset:0;display:flex;flex-direction:column;padding:180px 88px 160px">
            ${logo({ trazo: C.tinta, chip: C.coral, pulso: C.coral, fondo: C.crema, acento: C.coral, tamano: 84 })}
            <div style="margin-top:auto">
              <div style="font-family:'Manrope';font-weight:800;font-size:150px;line-height:.88;letter-spacing:-.055em;text-transform:uppercase">
                Gracias<br>por tu<br><span style="color:${C.coral}">compra</span>
              </div>
              <div style="margin-top:56px;font-size:40px;line-height:1.4;max-width:760px;color:rgba(30,27,24,.7)">
                Tu pedido ya salió. Revisado, embalado y en camino.
              </div>
            </div>
            <div style="margin-top:auto;display:flex;align-items:center;gap:44px;border-top:4px solid ${C.tinta};padding-top:56px">
              <div style="width:200px;height:200px;flex:none">${qr.sitio}</div>
              <div>
                <div style="font-weight:800;font-size:44px;letter-spacing:-.03em">${NEGOCIO.sitio}</div>
                <div style="margin-top:14px">${micro("escaneá y volvé a la tienda", { tamano: 26, color: "rgba(30,27,24,.6)" })}</div>
              </div>
            </div>
          </div>`,
      }),
    }),

    p({
      id: "redes-12-portada-1640x624",
      grupo: "redes",
      tipo: "pantalla",
      px: { ancho: 1640, alto: 624 },
      nota: "Portada de Facebook / cabecera. Lo importante va al centro: los bordes se recortan en móvil.",
      html: pagina({
        cssFuentes,
        ancho: "1640px",
        alto: "624px",
        fondo: C.tinta,
        cuerpo: `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:70px">
            <div style="position:absolute;left:0;top:0;bottom:0;width:70px;background:${rayas(C.coral, 26, 13)}"></div>
            <div style="position:absolute;right:0;top:0;bottom:0;width:70px;background:${rayas(C.coral, 26, 13)}"></div>
            ${isotipo({ trazo: C.crema, chip: C.coral, pulso: C.coral, fondo: C.tinta, tamano: 240 })}
            <div>
              <div style="font-family:'Chakra Petch';font-weight:700;font-size:104px;line-height:1;letter-spacing:-.02em;color:${C.crema}">
                Sálvame <span style="color:${C.coral}">el PC</span>
              </div>
              <div style="margin-top:26px;font-size:38px;color:rgba(246,241,231,.72);letter-spacing:-.02em">
                ${NEGOCIO.tagline}
              </div>
              <div style="margin-top:26px">${micro("tienda · servicio técnico · despacho a todo chile", { color: C.coral, tamano: 24 })}</div>
            </div>
          </div>`,
      }),
    }),

    /* ═══ GUÍA DE MARCA ═══════════════════════════════════════════════ */

    p({
      id: "kit-13-guia-de-marca-A4",
      grupo: "kit",
      tipo: "impreso",
      corte: { ancho: 210, alto: 297, forma: "A4 · 210 × 297 mm" },
      sinSangrado: true,
      nota: "Hoja de referencia para la imprenta y para quien diseñe algo nuevo de la marca.",
      html: pagina({
        cssFuentes,
        ancho: "210mm",
        alto: "297mm",
        fondo: C.crema,
        cuerpo: `<div style="position:absolute;inset:0;padding:${mm(18)}px ${mm(18)}px ${mm(14)}px;display:flex;flex-direction:column;text-align:left">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              ${logo({ trazo: C.tinta, chip: C.coral, pulso: C.coral, fondo: C.crema, acento: C.coral, tamano: mm(11) })}
              <div style="text-align:right">
                ${micro("guía de marca", { tamano: mm(2.4) })}<br>
                <span style="font-size:${mm(2.4)}px;color:rgba(30,27,24,.5)">v1 · ${new Date().toISOString().slice(0, 10)}</span>
              </div>
            </div>

            <div style="margin-top:${mm(12)}px;font-family:'Manrope';font-weight:800;font-size:${mm(13)}px;line-height:.92;letter-spacing:-.05em">
              La marca en<br>una hoja
            </div>

            ${seccion(
              "Logo",
              `
              <div style="display:flex;gap:${mm(6)}px;flex-wrap:wrap">
                ${caja(C.crema, logo({ trazo: C.tinta, chip: C.coral, pulso: C.coral, fondo: C.crema, acento: C.coral, tamano: mm(9) }), "sobre crema")}
                ${caja(C.tinta, logo({ trazo: C.crema, chip: C.coral, pulso: C.coral, fondo: C.tinta, acento: C.coral, tamano: mm(9) }), "sobre tinta")}
                ${caja(C.coral, logo({ trazo: C.tinta, chip: C.tinta, pulso: C.tinta, fondo: C.coral, acento: C.tinta, tamano: mm(9) }), "sobre coral")}
                ${caja(C.blanco, logo({ trazo: C.negro, chip: C.negro, pulso: C.negro, fondo: C.blanco, acento: C.negro, tamano: mm(9) }), "1 tinta / negro")}
              </div>
              <div style="margin-top:${mm(3)}px;font-size:${mm(2.6)}px;color:rgba(30,27,24,.6);line-height:1.45">
                Aire mínimo alrededor del logo: la altura del ícono. No estirarlo, no rotarlo,
                no cambiarle los colores ni ponerlo sobre fotos con detalle.
              </div>
            `,
            )}

            ${seccion(
              "Colores · CMYK aproximado",
              `
              <div style="display:flex;gap:${mm(4)}px">
                ${[
                  ["Tinta", C.tinta, "C60 M60 A60 N100", C.crema],
                  ["Coral", C.coral, "Pantone 178 C", C.tinta],
                  ["Crema", C.crema, "C3 M5 A11 N0", C.tinta],
                  ["Franja", C.franja, "C6 M9 A18 N0", C.tinta],
                ]
                  .map(
                    ([
                      n,
                      hex,
                      cmyk,
                      texto,
                    ]) => `<div style="flex:1;background:${hex};border:${mm(0.3)}px solid rgba(30,27,24,.15);padding:${mm(3)}px;height:${mm(26)}px;display:flex;flex-direction:column;justify-content:flex-end;color:${texto}">
                      <div style="font-weight:800;font-size:${mm(3.2)}px;letter-spacing:-.02em">${n}</div>
                      <div style="font-family:'Space Mono';font-size:${mm(2.3)}px;margin-top:${mm(1)}px">${hex}</div>
                      <div style="font-family:'Space Mono';font-size:${mm(2)}px;opacity:.7">${cmyk}</div>
                    </div>`,
                  )
                  .join("")}
              </div>
              <div style="margin-top:${mm(3)}px;font-size:${mm(2.6)}px;color:rgba(30,27,24,.6);line-height:1.45">
                <strong>Importante para la imprenta:</strong> el coral es un naranja muy saturado y en
                cuatricromía (CMYK) se apaga. Si el presupuesto lo permite, pedirlo como tinta directa
                Pantone 178 C. Si no, avisar que se acepta la diferencia.
              </div>
            `,
            )}

            ${seccion(
              "Tipografías",
              `
              <div style="display:flex;gap:${mm(6)}px">
                ${[
                  ["Chakra Petch Bold", "Sálvame", "Chakra Petch", 700, mm(7), "solo el logo"],
                  ["Manrope ExtraBold", "Títulos", "Manrope", 800, mm(7), "titulares, precios"],
                  ["Manrope Regular", "Texto corrido", "Manrope", 400, mm(4.4), "párrafos"],
                  [
                    "Space Mono Bold",
                    "DETALLES",
                    "Space Mono",
                    700,
                    mm(3.6),
                    "etiquetas, versalitas",
                  ],
                ]
                  .map(
                    ([n, muestra, fam, peso, tam, uso]) => `<div style="flex:1">
                      <div style="font-family:'${fam}';font-weight:${peso};font-size:${tam}px;letter-spacing:-.03em;line-height:1.1">${muestra}</div>
                      <div style="margin-top:${mm(2)}px;font-family:'Space Mono';font-size:${mm(2.2)}px;letter-spacing:.1em;text-transform:uppercase">${n}</div>
                      <div style="font-size:${mm(2.3)}px;color:rgba(30,27,24,.55)">${uso}</div>
                    </div>`,
                  )
                  .join("")}
              </div>
            `,
            )}

            ${seccion(
              "Tono",
              `
              <div style="font-size:${mm(2.9)}px;line-height:1.5;color:rgba(30,27,24,.72);max-width:${mm(150)}px">
                Directo, sin tecnicismos y sin promesas infladas. Se habla de tú a tú, se explica lo que
                el cliente necesita saber y se evita el "¡increíble oferta!". Si una frase no la diría un
                técnico honesto atendiendo el mesón, no va.
              </div>
            `,
            )}

            <div style="margin-top:auto;border-top:${mm(0.4)}px solid ${C.tinta};padding-top:${mm(4)}px;display:flex;justify-content:space-between;align-items:center">
              ${micro(NEGOCIO.sitio, { tamano: mm(2.4) })}
              <div style="width:${mm(16)}px;height:${mm(16)}px">${qr.sitio}</div>
            </div>
          </div>`,
      }),
    }),
  ];
}

function seccion(titulo, contenido) {
  return `<div style="margin-top:${mm(10)}px">
    <div style="display:flex;align-items:center;gap:${mm(3)}px;margin-bottom:${mm(4)}px">
      ${micro(titulo, { tamano: mm(2.6) })}
      <span style="flex:1;height:${mm(0.3)}px;background:rgba(30,27,24,.25)"></span>
    </div>
    ${contenido}
  </div>`;
}

function caja(fondo, dentro, pie) {
  return `<div>
    <div style="background:${fondo};border:${mm(0.3)}px solid rgba(30,27,24,.15);padding:${mm(4)}px ${mm(5)}px;display:flex;align-items:center;justify-content:center;min-width:${mm(38)}px;height:${mm(20)}px">${dentro}</div>
    <div style="margin-top:${mm(1.5)}px;text-align:center">${micro(pie, { tamano: mm(2), color: "rgba(30,27,24,.55)" })}</div>
  </div>`;
}
