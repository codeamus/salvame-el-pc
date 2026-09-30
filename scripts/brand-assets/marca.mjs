/**
 * Piezas compartidas de la identidad para el material impreso.
 *
 * Es la MISMA marca del sitio, no una copia libre: los colores salen de
 * src/styles/tokens.css y el isotipo es el trazado de
 * src/components/brand/Logo.astro. Si mañana cambia el logo del sitio, esto
 * se actualiza acá y todo el material se vuelve a generar.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
export const RAIZ = resolve(aqui, "../..");

/* ── Paleta ─────────────────────────────────────────────────────────────
   Los mismos hex de tokens.css. En imprenta el coral hay que pedirlo como
   Pantone o avisar que se convierte a CMYK: en cuatricromía un #FF5A48 se
   apaga bastante. El equivalente aproximado va en la guía de marca.        */
export const C = {
  tinta: "#1E1B18",
  coral: "#FF5A48",
  crema: "#F6F1E7",
  franja: "#EDE5D4",
  blanco: "#FFFFFF",
  negro: "#000000",
};

/* ── Tipografías ────────────────────────────────────────────────────────
   Se incrustan en base64 en vez de linkearlas: así el PDF sale con la
   fuente embebida y la imprenta no necesita tenerla instalada. Solo el
   subset latin — alcanza de sobra para castellano.                        */
const FUENTES = [
  ["Chakra Petch", 700, "chakra-petch/files/chakra-petch-latin-700-normal.woff2"],
  ["Manrope", 400, "manrope/files/manrope-latin-400-normal.woff2"],
  ["Manrope", 700, "manrope/files/manrope-latin-700-normal.woff2"],
  ["Manrope", 800, "manrope/files/manrope-latin-800-normal.woff2"],
  ["Space Mono", 400, "space-mono/files/space-mono-latin-400-normal.woff2"],
  ["Space Mono", 700, "space-mono/files/space-mono-latin-700-normal.woff2"],
];

export const cssFuentes = FUENTES.map(([familia, peso, ruta]) => {
  const b64 = readFileSync(resolve(RAIZ, "node_modules/@fontsource", ruta)).toString("base64");
  return `@font-face{font-family:"${familia}";font-style:normal;font-weight:${peso};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
}).join("\n");

/* ── Isotipo ────────────────────────────────────────────────────────────
   El monitor con el chip latiendo, calcado de Logo.astro. Va como función
   y no como archivo fijo porque cada pieza lo necesita en un par de
   colores distinto (sobre tinta, sobre crema, sobre coral, monocromo).

   `fondo` es el color sobre el que se va a pegar el logo: el pulso que
   cruza el chip se dibuja con él, que es lo que hace que se lea como un
   calado y no como una línea más.                                         */
export function isotipo({
  trazo = C.tinta,
  chip = C.coral,
  pulso = C.coral,
  fondo = C.crema,
  tamano = 48,
} = {}) {
  return `<svg width="${tamano}" height="${tamano}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="5" width="42" height="30" rx="3.5" stroke="${trazo}" stroke-width="3"/>
  <path d="M3 29.5h42" stroke="${trazo}" stroke-width="2.5"/>
  <path d="M19 35l-3 6M29 35l3 6M14 42h20" stroke="${trazo}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <g stroke="${trazo}" stroke-width="2" stroke-linecap="round">
    <path d="M21 11.5V9M24 11.5V9M27 11.5V9"/>
    <path d="M21 23.5V26M24 23.5V26M27 23.5V26"/>
    <path d="M18 14.5h-3M18 20.5h-3"/>
    <path d="M30 14.5h3M30 20.5h3"/>
  </g>
  <rect x="18" y="11.5" width="12" height="12" rx="2" fill="${chip}" stroke="${trazo}" stroke-width="2"/>
  <path d="M6 17.5h12M30 17.5h12" stroke="${pulso}" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M18 17.5h2l1.5-4 2 8 1.5-6 1.5 2h3" stroke="${fondo}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

/**
 * Logo completo: isotipo + wordmark al lado, con "el PC" en coral.
 * `acento` permite apagarlo en las versiones monocromas.
 */
export function logo({
  trazo = C.tinta,
  chip = C.coral,
  pulso = C.coral,
  fondo = C.crema,
  acento = C.coral,
  tamano = 48,
  gap = 0.2,
} = {}) {
  return `<span style="display:inline-flex;align-items:center;gap:${tamano * gap}px">
  ${isotipo({ trazo, chip, pulso, fondo, tamano })}
  <span style="font-family:'Chakra Petch';font-weight:700;font-size:${tamano * 0.5}px;line-height:1;letter-spacing:-.01em;color:${trazo};white-space:nowrap">Sálvame <span style="color:${acento}">el PC</span></span>
</span>`;
}

/** Microtexto de la marca: mono, versalitas, muy espaciado. */
export function micro(
  texto,
  { color = C.tinta, tamano = 7, espaciado = ".18em", peso = 700 } = {},
) {
  return `<span style="font-family:'Space Mono';font-weight:${peso};font-size:${tamano}px;letter-spacing:${espaciado};text-transform:uppercase;color:${color}">${texto}</span>`;
}

/* ── Datos del negocio ──────────────────────────────────────────────────
   Se leen de src/config/site.ts para que el impreso y el sitio digan lo
   mismo. Es un parseo con regex y no un import porque site.ts es
   TypeScript y este script corre en node pelado; alcanza de sobra para
   sacar un puñado de strings literales.                                    */
function campo(fuente, clave) {
  const m = fuente.match(new RegExp(`${clave}:\\s*"([^"]*)"`));
  if (!m) throw new Error(`No pude leer "${clave}" de src/config/site.ts`);
  return m[1];
}

const siteTs = readFileSync(resolve(RAIZ, "src/config/site.ts"), "utf8");

export const NEGOCIO = {
  nombre: campo(siteTs, "name"),
  tagline: campo(siteTs, "tagline"),
  url: campo(siteTs, "url"),
  sitio: campo(siteTs, "url").replace(/^https?:\/\//, ""),
  whatsapp: campo(siteTs, "whatsappDisplay"),
  instagram: campo(siteTs, "instagramHandle"),
};

/** true si el dato sigue siendo un placeholder del handoff. */
export const esPlaceholder = (v) => /0000|^\[/.test(v);
