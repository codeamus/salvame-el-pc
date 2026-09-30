/**
 * Genera todo el material de marca a PDF (imprenta) y PNG (pantalla).
 *
 *   pnpm brand:assets
 *
 * Usa el Chromium de Playwright, que ya está instalado para los tests E2E,
 * así que no hace falta Illustrator ni Inkscape. El PDF que produce es
 * vectorial y lleva la tipografía embebida: es lo que se manda a imprimir.
 *
 * Los PNG de las piezas impresas salen a 300 dpi y son solo para previsualizar
 * o mandar por WhatsApp — a la imprenta va SIEMPRE el PDF.
 */

import { chromium } from "@playwright/test";
import QRCode from "qrcode";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { C, NEGOCIO, RAIZ, cssFuentes, isotipo, logo } from "./marca.mjs";
import { construirPiezas, mm } from "./piezas.mjs";

const SALIDA = resolve(RAIZ, "brand/print");
const DPI = 300;
const ESCALA_300 = DPI / 96; // el CSS de Chromium siempre es de 96 dpi

const SITIO = NEGOCIO.url;

async function qrSvg(texto) {
  // margin:0 porque el aire alrededor ya lo pone el layout de cada pieza.
  const svg = await QRCode.toString(texto, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: C.tinta, light: "#0000" },
  });
  return svg.replace("<svg ", '<svg style="width:100%;height:100%;display:block" ');
}

/* ── Variantes de logo sueltas ──────────────────────────────────────────
   El isotipo va como SVG puro (solo trazados, sin texto): cualquiera lo
   abre en cualquier programa y no depende de tener la fuente instalada.
   El logo COMPLETO —que sí lleva el wordmark— se entrega en PDF y PNG,
   porque en SVG el texto se rompería en una máquina sin Chakra Petch.     */
const VARIANTES_LOGO = [
  {
    nombre: "isotipo-color-sobre-crema",
    fondo: C.crema,
    colores: { trazo: C.tinta, chip: C.coral, pulso: C.coral, fondo: C.crema },
  },
  {
    nombre: "isotipo-color-sobre-tinta",
    fondo: C.tinta,
    colores: { trazo: C.crema, chip: C.coral, pulso: C.coral, fondo: C.tinta },
  },
  {
    nombre: "isotipo-sobre-coral",
    fondo: C.coral,
    colores: { trazo: C.tinta, chip: C.tinta, pulso: C.tinta, fondo: C.coral },
  },
  {
    nombre: "isotipo-1tinta-negro",
    fondo: C.blanco,
    colores: { trazo: C.negro, chip: C.negro, pulso: C.negro, fondo: C.blanco },
  },
  {
    nombre: "isotipo-1tinta-blanco",
    fondo: C.tinta,
    colores: { trazo: C.blanco, chip: C.blanco, pulso: C.blanco, fondo: C.tinta },
  },
];

async function main() {
  await rm(SALIDA, { recursive: true, force: true });
  for (const d of ["pdf", "png", "logo"]) await mkdir(resolve(SALIDA, d), { recursive: true });

  const qr = { sitio: await qrSvg(SITIO) };
  const piezas = construirPiezas({ cssFuentes, qr });

  const navegador = await chromium.launch();
  const generados = [];

  for (const pieza of piezas) {
    const ancho =
      pieza.tipo === "impreso"
        ? Math.round(mm(pieza.corte.ancho + (pieza.sinSangrado ? 0 : 6)))
        : pieza.px.ancho;
    const alto =
      pieza.tipo === "impreso"
        ? Math.round(mm(pieza.corte.alto + (pieza.sinSangrado ? 0 : 6)))
        : pieza.px.alto;

    const ctx = await navegador.newContext({
      viewport: { width: ancho, height: alto },
      deviceScaleFactor: pieza.tipo === "impreso" ? ESCALA_300 : 1,
    });
    const page = await ctx.newPage();
    await page.setContent(pieza.html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    await page.screenshot({ path: resolve(SALIDA, "png", `${pieza.id}.png`), type: "png" });

    if (pieza.tipo === "impreso") {
      await page.pdf({
        path: resolve(SALIDA, "pdf", `${pieza.id}.pdf`),
        printBackground: true,
        preferCSSPageSize: true,
        scale: 1,
      });
    }

    await ctx.close();
    generados.push(pieza);
    console.log(`  ✓ ${pieza.id}`);
  }

  /* Variantes de logo */
  for (const { nombre, colores, fondo } of VARIANTES_LOGO) {
    await writeFile(
      resolve(SALIDA, "logo", `${nombre}.svg`),
      isotipo({ ...colores, tamano: 512 }),
      "utf8",
    );

    const ctx = await navegador.newContext({
      viewport: { width: 1600, height: 420 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    const completo = nombre.replace("isotipo", "logo-completo");
    await page.setContent(
      `<!doctype html><meta charset="utf-8"><style>${cssFuentes}
       @page{size:1600px 420px;margin:0}
       *{margin:0;box-sizing:border-box}
       html,body{width:1600px;height:420px}
       body{background:${fondo};display:flex;align-items:center;justify-content:center}</style>
       <body>${logo({ ...colores, acento: colores.chip === colores.trazo ? colores.trazo : C.coral, tamano: 190 })}</body>`,
      { waitUntil: "load" },
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(SALIDA, "logo", `${completo}.png`) });
    await page.pdf({
      path: resolve(SALIDA, "logo", `${completo}.pdf`),
      printBackground: true,
      preferCSSPageSize: true,
    });
    await ctx.close();
    console.log(`  ✓ logo/${nombre}`);
  }

  await navegador.close();
  await writeFile(resolve(SALIDA, "README.md"), readmePara(generados), "utf8");
  console.log(
    `\n${generados.length} piezas + ${VARIANTES_LOGO.length} variantes de logo en brand/print/`,
  );
}

function readmePara(piezas) {
  const grupos = {
    stickers: "Stickers de envío",
    tarjeta: "Tarjeta de agradecimiento",
    inserto: "Inserto A6",
    redes: "Redes sociales",
    kit: "Kit de marca",
  };

  const filas = (g) =>
    piezas
      .filter((p) => p.grupo === g)
      .map((p) => {
        const medida = p.tipo === "impreso" ? p.corte.forma : `${p.px.ancho} × ${p.px.alto} px`;
        const archivos =
          p.tipo === "impreso"
            ? `\`pdf/${p.id}.pdf\`<br>\`png/${p.id}.png\``
            : `\`png/${p.id}.png\``;
        return `| ${medida} | ${p.nota} | ${archivos} |`;
      })
      .join("\n");

  return `# Material de marca · Sálvame el PC

Generado con \`pnpm brand:assets\`. **No editar a mano**: los archivos de esta
carpeta se borran y se rehacen en cada corrida. Lo que se toca es
\`scripts/brand-assets/piezas.mjs\`.

Todo sale del mismo lugar que el sitio — los colores de \`src/styles/tokens.css\`
y el logo de \`src/components/brand/Logo.astro\` — así que el material impreso y
la web no se van a despegar nunca.

## Qué mandar a la imprenta

**El PDF, siempre.** Es vectorial, tiene la tipografía embebida y ya trae el
sangrado. El PNG es solo para previsualizar o mandar por WhatsApp.

### Sangrado y corte

Cada PDF de impresión mide **el tamaño final + 3 mm por lado**. El corte va
exactamente a 3 mm de cada borde de la página. Es la forma estándar de
entregarlo y cualquier imprenta lo entiende; si te lo piden con marcas de
corte, avisá y se agregan.

La única excepción es la guía de marca, que es un A4 a leer, no a cortar.

### Color

El coral \`#FF5A48\` es un naranja muy saturado y **en CMYK se apaga**. Si el
trabajo lo permite, pedirlo como tinta directa **Pantone 178 C**. Si va en
cuatricromía, avisar al cliente de antemano que el impreso va a salir un punto
más apagado que la pantalla.

### Materiales sugeridos

| Pieza | Material |
|---|---|
| Stickers | Vinilo blanco brillante, troquelado a la forma |
| Precinto | Vinilo blanco, adhesivo permanente |
| Tarjeta 90 × 50 | Cartulina 300 g, tiro y retiro, mate |
| Inserto A6 | Cartulina 250–300 g, una cara |

## Las piezas

${Object.entries(grupos)
  .map(
    ([g, titulo]) =>
      `### ${titulo}\n\n| Medida | Para qué es | Archivos |\n|---|---|---|\n${filas(g)}`,
  )
  .join("\n\n")}

### Logo suelto — \`logo/\`

El **isotipo** (solo el monitor con el chip) va en SVG: son trazados puros, se
abre en cualquier programa y escala infinito sin necesitar la fuente.

El **logo completo** (isotipo + "Sálvame el PC") va en PDF y PNG, no en SVG: el
wordmark es texto real, y en un SVG se rompería en cualquier máquina que no
tenga Chakra Petch instalada. El PDF la lleva embebida.

## Lo que dice el impreso es vinculante

El inserto A6 menciona la **garantía legal de 6 meses** y el **diagnóstico en
24 horas**: son exactamente las condiciones publicadas en
\`/terminos-y-condiciones\` y \`/servicio-tecnico\`. Si mañana cambian ahí, hay
que cambiarlas acá también — un folleto que promete más que el sitio es lo que
vale ante un reclamo, y el diagnóstico **no es gratis**, tiene precio publicado.

## Datos pendientes del cliente

El teléfono y el Instagram salen de \`CONTACT\` en \`src/config/site.ts\` y **hoy
son placeholders**. En cuanto el cliente los pase,
se cambian ahí, se corre \`pnpm brand:assets\` de nuevo y el material queda al
día — no hay que retocar ningún archivo a mano.
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
