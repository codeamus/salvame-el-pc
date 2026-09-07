# Material de marca · Sálvame el PC

Generado con `pnpm brand:assets`. **No editar a mano**: los archivos de esta
carpeta se borran y se rehacen en cada corrida. Lo que se toca es
`scripts/brand-assets/piezas.mjs`.

Todo sale del mismo lugar que el sitio — los colores de `src/styles/tokens.css`
y el logo de `src/components/brand/Logo.astro` — así que el material impreso y
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

El coral `#FF5A48` es un naranja muy saturado y **en CMYK se apaga**. Si el
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

### Stickers de envío

| Medida | Para qué es | Archivos |
|---|---|---|
| círculo Ø50 mm | Sticker principal de marca. Troquel circular. | `pdf/sticker-01-logo-50mm.pdf`<br>`png/sticker-01-logo-50mm.png` |
| círculo Ø50 mm | El que pidió el cliente: cierra la caja y dice gracias. Troquel circular. | `pdf/sticker-02-gracias-50mm.pdf`<br>`png/sticker-02-gracias-50mm.png` |
| rectángulo 70 × 40 mm, esquinas redondeadas 3 mm | Va en el exterior de la caja, bien visible. Ideal en papel blanco brillante. | `pdf/sticker-03-fragil-70x40mm.pdf`<br>`png/sticker-03-fragil-70x40mm.png` |
| rectángulo 90 × 25 mm | Precinto: se pega cruzando la solapa de la caja. Si alguien la abre, se nota. | `pdf/sticker-04-precinto-90x25mm.pdf`<br>`png/sticker-04-precinto-90x25mm.png` |
| círculo Ø40 mm | Sello de control de calidad para el producto o la boleta. La línea es para escribir la fecha a mano. | `pdf/sticker-05-revisado-40mm.pdf`<br>`png/sticker-05-revisado-40mm.png` |

### Tarjeta de agradecimiento

| Medida | Para qué es | Archivos |
|---|---|---|
| rectángulo 90 × 50 mm (tamaño tarjeta) | Cara A. Imprimir junto con la cara B, tiro y retiro, en cartulina 300 g. | `pdf/tarjeta-06-gracias-frente-90x50mm.pdf`<br>`png/tarjeta-06-gracias-frente-90x50mm.png` |
| rectángulo 90 × 50 mm (tamaño tarjeta) | Cara B. El QR lleva a salvameelpc.cl. | `pdf/tarjeta-07-gracias-reverso-90x50mm.pdf`<br>`png/tarjeta-07-gracias-reverso-90x50mm.png` |

### Inserto A6

| Medida | Para qué es | Archivos |
|---|---|---|
| A6 · 105 × 148 mm | La pieza grande de agradecimiento que va adentro de la caja. Cartulina 250–300 g. | `pdf/inserto-08-gracias-A6.pdf`<br>`png/inserto-08-gracias-A6.png` |

### Redes sociales

| Medida | Para qué es | Archivos |
|---|---|---|
| 1080 × 1080 px | Post cuadrado de agradecimiento. Instagram / Facebook. | `png/redes-09-post-gracias-1080.png` |
| 1080 × 1080 px | Post de marca / presentación. Sirve de foto de perfil recortada al centro también. | `png/redes-10-post-marca-1080.png` |
| 1080 × 1920 px | Historia de Instagram / WhatsApp. El QR se puede tocar desde la historia si lo subís con sticker de link. | `png/redes-11-story-1080x1920.png` |
| 1640 × 624 px | Portada de Facebook / cabecera. Lo importante va al centro: los bordes se recortan en móvil. | `png/redes-12-portada-1640x624.png` |

### Kit de marca

| Medida | Para qué es | Archivos |
|---|---|---|
| A4 · 210 × 297 mm | Hoja de referencia para la imprenta y para quien diseñe algo nuevo de la marca. | `pdf/kit-13-guia-de-marca-A4.pdf`<br>`png/kit-13-guia-de-marca-A4.png` |

### Logo suelto — `logo/`

El **isotipo** (solo el monitor con el chip) va en SVG: son trazados puros, se
abre en cualquier programa y escala infinito sin necesitar la fuente.

El **logo completo** (isotipo + "Sálvame el PC") va en PDF y PNG, no en SVG: el
wordmark es texto real, y en un SVG se rompería en cualquier máquina que no
tenga Chakra Petch instalada. El PDF la lleva embebida.

## Lo que dice el impreso es vinculante

El inserto A6 menciona la **garantía legal de 6 meses** y el **diagnóstico en
24 horas**: son exactamente las condiciones publicadas en
`/terminos-y-condiciones` y `/servicio-tecnico`. Si mañana cambian ahí, hay
que cambiarlas acá también — un folleto que promete más que el sitio es lo que
vale ante un reclamo, y el diagnóstico **no es gratis**, tiene precio publicado.

## Datos pendientes del cliente

El teléfono y el Instagram salen de `CONTACT` en `src/config/site.ts` y **hoy
son placeholders**. En cuanto el cliente los pase,
se cambian ahí, se corre `pnpm brand:assets` de nuevo y el material queda al
día — no hay que retocar ningún archivo a mano.
