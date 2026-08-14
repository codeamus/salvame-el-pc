# Handoff: Ecommerce "Sálvame el PC" → Astro

## Overview

Ecommerce de hardware y periféricos (Chile, textos en español, precios CLP). Incluye 7 pantallas: Home, Catálogo con filtros, Single de producto, Servicio técnico, Contacto, Carrito y Checkout (despacho) con salida a Mercado Pago. Estética: minimal/brutalista sobre grilla con bordes de 1px, sin border-radius, sombras duras color coral.

## About the Design Files

`Salvame el PC.dc.html` es una **referencia de diseño hecha en HTML** (prototipo interactivo), no código de producción. La tarea es **recrear este diseño en Astro** usando sus patrones (páginas `.astro`, islands solo donde hay estado, View Transitions nativas). No copiar el HTML tal cual.

## Fidelity

**High-fidelity**: colores, tipografía, espaciados, copys e interacciones son finales. Recrear pixel-perfect. Las fotos de producto son placeholders de Unsplash (se reemplazarán por fotos reales).

## Stack sugerido en Astro

- Astro 5+, `<ClientRouter />` (View Transitions) en el layout.
- Rutas: `/` (home), `/tienda` (catálogo, query params `?cat=&marca=&orden=`), `/producto/[slug]`, `/servicio-tecnico`, `/contacto`, `/carrito`, `/checkout`.
- Carrito: nanostores (`persistentAtom` a localStorage) + isla (React/Preact/Svelte o vanilla) para contador del header, carrito y checkout.
- Productos: colección de contenido o `src/data/productos.json` (incluido en este paquete).
- Pago: Checkout Pro de Mercado Pago — endpoint server (`/api/checkout`) crea la preference con los items y redirige a `init_point`. El prototipo lo simula con un modal.

## Design Tokens

Colores (los únicos 3 + derivados por opacidad):

- Fondo / crema: `#F6F1E7`
- Tinta / negro: `#1E1B18`
- Acento / coral: `#FF5A48`
- Stripes de placeholder: `repeating-linear-gradient(45deg, #EDE5D4 0 12px, #F6F1E7 12px 24px)`
- Texto secundario: `rgba(30,27,24,.55)` sobre crema; `rgba(246,241,231,.6)` sobre negro.

Tipografía (Google Fonts):

- **Manrope** 400/500/700/800 — texto y titulares. Titulares: weight 800, `letter-spacing: -.03em a -.045em`, uppercase, `line-height: .94`.
- **Space Mono** 400/700 — precios, chips, eyebrows, metadatos. Eyebrows: 11-12px, `letter-spacing: .14em`, uppercase.

Escala: hero `clamp(52px, 8.5vw, 128px)`; h2 de sección 40px; título single `clamp(28px, 3vw, 44px)`; cuerpo 14-16px; mono meta 11-13px.

Reglas de estilo globales:

- `border-radius: 0` en todo. Bordes `1px solid #1E1B18`.
- Hover de cards/botones primarios: `transform: translate(-2px o -3px, ídem)` + `box-shadow: 4-5px 4-5px 0 <coral o tinta>`.
- Botón primario: fondo coral, texto tinta, borde tinta, weight 800.
- Botón secundario: transparente, borde tinta; hover invierte (fondo tinta, texto crema).
- `::selection` coral. Focus de inputs: `outline: 2px solid #FF5A48; offset -1px`.
- Precios siempre en Space Mono: `'$' + n.toLocaleString('es-CL')` → `$19.990`.

## Screens / Views

### Header (global, sticky)

Barra 64px, fondo crema, borde inferior tinta. Izquierda: logo texto "SÁLVAME EL PC" + asterisco coral (el cliente tiene logo propio — dejar slot). Centro: Tienda / Servicio técnico / Contacto (14px, 600, hover coral). Derecha: botón "Carrito" con contador en chip coral mono. Sobre el header va una barra promo negra opcional (mono 11px, uppercase): "Envío gratis sobre $50.000 · Pago seguro con Mercado Pago · Despacho a todo Chile".

### Home

1. **Hero tipográfico**: eyebrow mono coral "TIENDA DE HARDWARE — SANTIAGO, CHILE"; H1 gigante "HARDWARE Y PERIFÉRICOS / SIN VUELTAS." (segunda línea coral); CTAs "Ver catálogo →" (primario) y "Servicio técnico" (secundario) + nota mono.
2. **Bento grid** (4 columnas, filas 170px, celdas separadas por bordes 1px, sin gap):
   - Producto destacado 2×2 (foto full-bleed, chip mono "MARCA · DESTACADO" arriba-izq, barra inferior con nombre + precio — misma altura que las barras de categoría para que las líneas calcen).
   - 6 tiles de categoría 1×1: foto de fondo (usar un producto distinto al destacado), chip "02 productos" arriba-izq, barra inferior crema con nombre + flecha (hover: barra coral). Click → catálogo filtrado.
   - Tile "Servicio técnico" 2×1 negro: eyebrow coral, "Armamos, reparamos y revivimos tu PC" + flecha.
3. **Marquee sponsors**: cinta infinita mono 26px uppercase "REDRAGON ✱ LOGITECH ✱ …" (✱ coral), animación translateX -50% en loop 22s, bordes arriba/abajo.
4. **Destacados**: h2 + link mono "ver todo →" subrayado coral; grilla 4 cards.
5. **Ofertas de la semana**: sección fondo coral, grilla 3 cards horizontales (foto 42% izquierda, badge "-XX%" negro, precio + precio anterior tachado).
6. **Banner servicio técnico**: sección negra split 1.2fr/1fr — texto + CTA coral, derecha placeholder de video con botón play circular y caption mono "[ video: armado pc gamer / 2:14 ]".

### Card de producto (catálogo/destacados)

Borde tinta, foto 4:3 arriba (borde inferior), badge coral "-XX%" si hay oferta, cuerpo: marca (mono coral 11px uppercase), nombre (700, 15px), fila precio (mono 700) + precio anterior tachado + botón "+" 30×30 (agregar al carrito, `stopPropagation`). Card clickeable → single. Hover: translate(-3,-3) + sombra coral.

### Catálogo (/tienda)

Grid `280px 1fr`. Sidebar (borde derecho): CATEGORÍA (botones lista: Todos, Mouse, Teclados, RAM, Audífonos, Monitores, GPU — activo: fondo tinta/texto crema), MARCA (checkboxes ■/□ mono), ORDENAR (select: Relevancia / Precio menor a mayor / mayor a menor). Contenido: título = categoría activa + contador mono "NN productos"; grilla 3 columnas de cards. Filtros combinables; en Astro mantenerlos en query params.

### Single de producto (/producto/[slug])

Breadcrumb mono "Tienda / {cat} / {nombre}". Grid `1.1fr 1fr` con bordes: izquierda foto 4:3 full-bleed (badge oferta); derecha: eyebrow "MARCA · CATEGORÍA", H1, precio 30px mono + tachado, lista de 4 specs (filas con separador, bullet ■ coral), stepper de cantidad (− / n / +, bordes tinta) + botón "Agregar al carrito" (primario, flex 1), fila mono "✓ stock disponible ✓ envío a todo chile ✓ pago con mercado pago". Abajo: **Relacionados** (misma categoría, 3 cards con foto 16:8).

### Servicio técnico (/servicio-tecnico)

Hero tipográfico ("SERVICIO TÉCNICO." + eyebrow "No lo botes todavía"). 3 columnas con borde: 01 Armado de PC (desde $25.000), 02 Reparación (diagnóstico $10.000, 24 h), 03 Mantención y limpieza (desde $15.000) — número mono coral, título 24px, descripción, precio mono abajo. Sección negra "ASÍ TRABAJAMOS (EN VIDEO)": 3 placeholders 16:9 con play y caption mono (aquí van los videos reales del taller — embeds de YouTube/archivos). CTA final: "AGENDA POR WHATSAPP" + botón coral con número.

### Contacto (/contacto)

Split 50/50. Izquierda: "HABLEMOS." + form (Nombre, Correo, select Asunto [Consulta por producto / Servicio técnico / Estado de mi pedido / Otro], Mensaje, botón "Enviar mensaje →"); al enviar, reemplazar por caja negra de éxito "Mensaje enviado ✓". Derecha: Taller y tienda (dirección), Horario, Redes sociales (Instagram y WhatsApp como botones borde tinta, hover coral), placeholder de mapa.

### Carrito (/carrito)

Título "TU CARRITO (n)". Vacío: caja bordeada centrada + CTA al catálogo. Con items: grid `1.6fr 1fr` — lista bordeada (thumb 88×66, marca/nombre/precio unitario, stepper, total línea mono, ✕ eliminar) y aside sticky "Resumen": Subtotal, Envío ($3.990; **Gratis** si subtotal ≥ $50.000), Total, nota coral "Te faltan $X para envío gratis" / "✓ Tienes envío gratis", CTA "Ir al checkout →", nota mono "pago seguro vía mercado pago".

### Checkout (/checkout)

Título + paso mono "01 despacho → 02 pago en mercado pago". Grid `1.5fr 1fr`: fieldsets bordeados con legend mono — **Contacto** (Nombre y apellido, RUT, Correo, Teléfono +56 9) y **Dirección de despacho** (Región [select con regiones de Chile], Comuna, Calle y número, Depto/referencia opcional). Solo envío, no hay retiro en tienda. Aside sticky "Tu pedido": líneas nombre ×qty + total, Envío, Total, botón "Pagar con Mercado Pago →" y nota "serás redirigido a mercado pago". Submit → crear preference de MP y redirigir (el prototipo muestra un modal simulándolo).

### Footer (global, negro)

4 columnas: marca + bajada; Tienda (Catálogo, Carrito, Servicio técnico); Ayuda (Contacto, Envíos y devoluciones, Garantías); Síguenos (Instagram @salvamelpc, WhatsApp). Barra inferior mono 11px: "© 2026 Sálvame el PC — Santiago, Chile" / "pagos procesados por mercado pago".

## Interactions & Behavior

- **View Transitions (clave del encargo)**: la foto del producto transiciona de card → single. En Astro: `transition:name={'prod-' + p.id}` en la imagen de la card Y en la imagen del single, con `<ClientRouter />`. En el prototipo cada contenedor de imagen usa `view-transition-name: prod-{id}`; duración .3s. Aplica desde: bento destacado, tiles de catálogo/destacados/ofertas/relacionados.
- Toast al agregar al carrito: pill fijo abajo-centro, negro con borde coral, mono 12px, "Agregado: {nombre} · ver carrito", autodesaparece a los ~2.6s.
- Stepper nunca baja de 1; eliminar es con ✕.
- Marquee: `@keyframes marquee { to { transform: translateX(-50%) } }`, contenido duplicado 2×.
- Imágenes con `onerror` → ocultar img y dejar visible el placeholder rayado con caption mono `[ foto: … ]`.
- Formularios: HTML5 `required`; contacto muestra estado de éxito sin recargar.

## State Management

- `cart: [{id, q}]` persistido en localStorage; derivados: contador, subtotal, envío (`0 si subtotal ≥ 50000, si no 3990`), total.
- Catálogo: `cat`, `marcas[]`, `orden` (en URL).
- Single: `qty` local.

## Assets

- Fotos: URLs de Unsplash en `productos.json` (temporales, reemplazar por fotos reales del cliente).
- Logo: el cliente tiene el suyo; el header actual usa texto.
- Sponsors: solo texto (Redragon, Logitech), no usar logos oficiales sin autorización.

## Files

- `Salvame el PC.dc.html` — prototipo HTML completo (fuente de verdad visual; abrir en el proyecto de diseño para verlo interactivo).
- `productos.json` — los 12 productos con precios, specs y fotos.
