# Sálvame el PC

Ecommerce de hardware y periféricos con servicio técnico (Santiago, Chile). **Esta fase es solo frontend**: sin backend, sin base de datos, sin pagos (la salida a Mercado Pago está simulada). El catálogo sale de `src/data/productos.json` y el sitio compila 100% estático.

El diseño se implementa pixel-perfect desde el handoff de Claude Design — specs completas en [docs/design/handoff.md](docs/design/handoff.md): 7 pantallas (Home, Catálogo con filtros, Ficha de producto, Servicio técnico, Contacto, Carrito y Checkout), estética minimal/brutalista (Manrope + Space Mono, `border-radius: 0`, sombras duras) y View Transitions nativas de card → ficha.

## Stack

| Capa        | Herramienta                   | Por qué                                                                    |
| ----------- | ----------------------------- | -------------------------------------------------------------------------- |
| Framework   | Astro 7 (`output: "static"`)  | HTML estático por defecto, JS solo donde hace falta                        |
| Interacción | React 19 (islands)            | Solo el carrito se hidrata; el resto es HTML puro                          |
| Estilos     | Tailwind v4 + tokens CSS      | Los tokens son la única fuente de verdad de la identidad visual            |
| Estado      | nanostores + persistent       | Comparte el carrito entre islands aisladas y lo persiste en `localStorage` |
| Calidad     | ESLint + Prettier + TS strict | Type-checking estricto, lint con type information, formato automático      |
| Tests       | Vitest + Testing Library      | Lógica de negocio y componentes                                            |
| E2E         | Playwright + axe-core         | Flujos reales de usuario + auditoría de accesibilidad                      |

## Comandos

```bash
pnpm install
pnpm dev              # servidor de desarrollo
pnpm verify           # TODO junto: formato + lint + tipos + tests + build
```

Por separado:

```bash
pnpm lint             # ESLint
pnpm format           # Prettier (escribe)
pnpm typecheck        # astro check
pnpm test             # Vitest (unitarios)
pnpm test:coverage    # con reporte de cobertura
pnpm test:e2e         # Playwright (levanta el build real, no el dev server)
pnpm build            # build de producción
```

## Estructura

```
src/
├── styles/
│   ├── tokens.css        ← ⭐ TODOS los colores, fuentes, radios y espaciados
│   └── global.css        ← estilos base + accesibilidad
├── types/product.ts      ← tipos de dominio + reglas (stock, descuento, precio)
├── data/products.ts      ← capa de datos (mock hoy, Supabase mañana)
├── config/site.ts        ← nombre, navegación, metadatos
├── lib/
│   ├── cn.ts             ← merge de clases de Tailwind
│   ├── format.ts         ← formato de precios CLP y unidades
│   └── cart-store.ts     ← estado del carrito
├── components/
│   ├── ui/               ← primitivos genéricos (Button, Card, Badge, Price…)
│   ├── brand/            ← Logo
│   ├── layout/           ← Header, Footer
│   ├── product/          ← ProductCard, ProductGrid, SpecList, StockBadge
│   └── cart/             ← islands de React (los únicos con JS en el cliente)
├── layouts/BaseLayout.astro
└── pages/                ← rutas del sitio
e2e/                      ← tests de Playwright
docs/backend-reference/   ← código de backend de la fase anterior (fuera del build)
brand/                    ← logos generados
```

## Decisiones de arquitectura

**Los colores viven en un solo archivo.** `src/styles/tokens.css` define la paleta (`#1E1B18`, `#FF5A48`, `#F6F1E7`), sus escalas derivadas y —lo importante— los **roles semánticos**: `--color-surface`, `--color-content-muted`, `--color-accent`. Los componentes usan los roles, no los colores crudos. Si mañana cambia la marca, se cambia un archivo y no cuarenta componentes. Al declararse con `@theme` de Tailwind v4, cada token genera su utilidad automáticamente (`--color-accent` → `bg-accent`, `text-accent`, `border-accent`).

**Los tipos de dominio son la frontera.** `src/types/product.ts` define qué es un producto y las reglas asociadas (`getStockStatus`, `getDiscountPercent`). `PriceCLP` es un _branded type_: no se puede pasar cualquier número como precio, hay que construirlo con `priceCLP()`, que valida que sea entero (el peso chileno no usa decimales) y no negativo.

**La capa de datos ya tiene la firma final.** `src/data/products.ts` devuelve `Promise` aunque hoy resuelva de inmediato. Los componentes ya están escritos como si el dato viniera de la red, así que conectar Supabase es reescribir el cuerpo de cuatro funciones sin tocar un solo componente.

**Componentes en dos niveles.** `ui/` son primitivos que no saben nada del negocio (un `Button` no sabe qué es una RAM). `product/` y `cart/` son de dominio y se construyen sobre los primitivos. Esa separación es lo que hace que `ui/` sea reutilizable de verdad.

**Las variantes se exportan desde `ui/variants.ts`, no desde los `.astro`.** Astro no permite exportar valores desde un componente: el frontmatter corre en build time y esos exports no existen para quien importa. Además, así un test puede importar el tipo sin arrastrar el componente.

**Solo el carrito lleva JavaScript al cliente.** Astro manda cero JS por defecto. Se hidrata `CartButton` con `client:idle` (no es crítico para la primera pintura), `AddToCartButton` con `client:visible` (solo si el usuario baja hasta él) y `CartView` con `client:load` (es el contenido principal de esa página). Todo lo demás es HTML estático.

**El carrito usa nanostores porque las islands están aisladas.** Sin un store compartido, el botón "agregar" de la ficha de producto y el contador del header no se enterarían el uno del otro. `@nanostores/persistent` lo sincroniza entre islands y lo guarda en `localStorage`. El decodificador filtra entradas con forma inválida: el `localStorage` puede tener datos viejos de una versión anterior del sitio, o editados a mano desde las devtools — nunca se confía en su forma.

**El precio guardado en el carrito es solo para mostrar.** Cuando se conecte el backend, el total tiene que recalcularse en el servidor leyendo el precio real de la base. Cualquiera puede editar el `localStorage`.

**`QuantityInput` mantiene un borrador local.** Si el input fuera controlado directamente por el store, borrar el contenido para reescribirlo haría que React reponga el valor anterior en cada tecla y termine concatenando (`1` + `4` = `14` en vez de `4`). Los tests atraparon exactamente ese bug.

## Accesibilidad

No es un extra, está en la definición de terminado:

- Enlace "saltar al contenido" para usuarios de teclado
- `:focus-visible` con outline coral consistente en todo el sitio
- `prefers-reduced-motion` respetado
- Nombres accesibles completos en botones ambiguos (`aria-label="Quitar Corsair 16GB del carrito"`, no solo "Quitar")
- `role="status"` + `aria-live="polite"` para confirmar al agregar al carrito sin robar el foco
- `<dl>` para las especificaciones, `<nav aria-label>` para cada navegación, `aria-current="page"` en el link activo
- Auditoría automática con axe-core (WCAG 2.1 A y AA) sobre 5 páginas en `e2e/accesibilidad.spec.ts`

### Contraste: por qué hay dos tokens de coral

El coral de marca `#FF5A48` sobre el fondo crema da **2,74:1** — no llega ni al mínimo para texto grande. Usarlo como color de texto hacía fallar la auditoría en todas las páginas. Pero como **fondo**, con texto ink encima, da **5,56:1** y pasa cómodo.

Por eso la paleta tiene dos roles distintos y no uno:

| Token                 | Valor     | Uso                                       | Ratio sobre crema |
| --------------------- | --------- | ----------------------------------------- | ----------------- |
| `--color-accent`      | `#FF5A48` | Fondos, bordes, íconos — **nunca texto**  | 2,74:1 ❌         |
| `--color-accent-text` | `#B83426` | Texto coral sobre fondos claros           | 5,24:1 ✅         |
| `--color-on-accent`   | `#1E1B18` | Texto encima de un fondo `--color-accent` | 5,56:1 ✅         |

El coral de marca se mantiene intacto donde se luce (botones, badges, el logo grande). Los colores de estado (`success`, `warning`, `danger`) también se ajustaron: los originales daban entre 2,89:1 y 4,46:1.

Aclaración honesta: axe detecta cerca del 30–40% de los problemas reales de accesibilidad. Que los tests pasen significa que no hay errores obvios detectables por una máquina, no que el sitio sea accesible. La prueba con teclado y lector de pantalla sigue siendo necesaria.

## Estado de los tests

- **77 tests unitarios** (Vitest): formato de precios, reglas de dominio, decodificador defensivo del carrito, componentes de React
- **36 tests E2E** (Playwright, en Chrome y Safari móvil): navegación, flujo completo del carrito, persistencia al recargar, accesibilidad
- Cobertura actual: **92,7%** de líneas (umbral mínimo configurado: 80% líneas, 75% ramas)

### Bugs reales que atraparon los tests

No son tests decorativos — durante el desarrollo encontraron cuatro defectos que ya están corregidos:

1. **El overlay de las tarjetas cubría toda la página.** El enlace del título usa `after:absolute after:inset-0` para hacer clickeable la tarjeta entera, pero a la tarjeta le faltaba `position: relative`. Sin ese ancestro posicionado, el pseudo-elemento se estiraba hasta el bloque contenedor inicial y bloqueaba todos los demás links del sitio. Hay un test de regresión específico.
2. **Contraste insuficiente en toda la paleta.** El coral de marca sobre crema da 2,74:1, muy por debajo del mínimo AA de 4,5:1 — axe reportó 403 violaciones. Ver la sección de contraste más abajo.
3. **Borrar la cantidad en el carrito eliminaba el producto.** Y con el input controlado directamente por el store, reescribir concatenaba (`1` + `4` = `14`). Se resolvió con `QuantityInput` y su borrador local.
4. **Espacio duro duplicado invisible** en `formatCapacity`/`formatSpeed`, que renderizaba "16&nbsp; GB" con doble espacio.

## Próximos pasos

1. Reemplazar el placeholder de imágenes por fotos reales de producto
2. Filtros del catálogo (por tipo de memoria, capacidad, marca, rango de precio)
3. Buscador
4. Páginas legales (términos, privacidad, derecho a retracto — obligatorias por la Ley del Consumidor)
5. Conectar backend: mover `docs/backend-reference/` de vuelta a `src/`, cambiar a `output: "server"` y sumar el adapter de Vercel
6. Facturación electrónica del SII (obligatoria — ver el doc de arquitectura del proyecto)

## Notas técnicas

- TypeScript pineado en `^5.9.3`, no en la serie 7.x: `astro check` todavía no soporta el compilador nativo nuevo.
- El sitio compila estático, así que Vercel lo sirve desde su CDN sin funciones serverless. Igual aplica la restricción de uso comercial del plan Hobby cuando se empiece a vender — ver el doc de arquitectura.
- `pnpm approve-builds` puede pedir aprobar el script de `esbuild`; es una dependencia transitiva normal.
