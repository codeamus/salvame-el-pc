# Pagos con TUU

Integración de **TUU Pago Online** (Haulmer) en el checkout del sitio.

Hoy corre **solo contra el ambiente de QA**, con las credenciales públicas de
integración: se puede probar el flujo completo de punta a punta sin mover un
peso. El paso a producción está documentado en la §7 y no requiere cambiar
código — solo cargar credenciales y reemplazar el store de órdenes.

---

## 1. Cómo funciona el flujo

```
Navegador (checkout)              Nuestro servidor                    TUU / Webpay
      │                                 │                                   │
      │ POST /api/checkout              │                                   │
      │ { items: [{id, quantity}],      │                                   │
      │   cliente: {...} }              │                                   │
      ├────────────────────────────────►│                                   │
      │                                 │ 1. valida al comprador            │
      │                                 │ 2. RECALCULA el total desde       │
      │                                 │    el catálogo del servidor       │
      │                                 │ 3. guarda la orden "pending"      │
      │                                 │ 4. firma HMAC-SHA256              │
      │                                 │ POST /v1/payment X-REDIRECT:false │
      │                                 ├──────────────────────────────────►│
      │                                 │◄─ 200 + URL del intento (texto)   │
      │◄─ { redirectUrl, reference } ───┤                                   │
      │                                 │                                   │
      │ window.location = redirectUrl   │                                   │
      ├─────────────────────────────────────────────────────────────────────►
      │                    el comprador paga en la pasarela                  │
      │                                 │                                   │
      │                                 │◄── POST /api/tuu/callback ────────┤  ◄── FUENTE DE VERDAD
      │                                 │    (form-urlencoded + firma)      │
      │                                 ├── 200 OK ────────────────────────►│
      │                                 │                                   │
      │◄── GET /pago/exito?ref=… ───────────────────────────────────────────┤  ◄── solo presentación
      │                                 │                                   │
      │ polling a /api/orders/[ref]     │                                   │
      ├────────────────────────────────►│                                   │
```

### La regla de oro

**La redirección del navegador no decide nada.** `/pago/exito` es una página
estática que cualquiera puede abrir escribiendo la URL a mano. El estado real
de la orden lo escribe **únicamente** `/api/tuu/callback`, que llega firmado
desde los servidores de TUU.

Por eso la página de éxito no dice "gracias por tu compra" al cargar: pregunta
por el estado real y recién ahí decide qué mostrar (y recién ahí vacía el
carrito).

---

## 2. Qué archivo hace qué

| Archivo                                                                             | Rol                                                                                                  |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [`src/lib/tuu/env.ts`](../src/lib/tuu/env.ts)                                       | Credenciales y endpoint según `TUU_ENV`. Único lugar que conoce la diferencia entre QA y producción. |
| [`src/lib/tuu/signature.ts`](../src/lib/tuu/signature.ts)                           | Firma y verificación HMAC-SHA256, con Web Crypto.                                                    |
| [`src/lib/tuu/client.ts`](../src/lib/tuu/client.ts)                                 | `createPaymentIntent()`: arma, firma y envía el intento.                                             |
| [`src/lib/orders/quote.ts`](../src/lib/orders/quote.ts)                             | **Recalcula el total en el servidor.** Lo que impide pagar $1 por una GPU.                           |
| [`src/lib/orders/store.ts`](../src/lib/orders/store.ts)                             | Persistencia de órdenes. ⚠️ Hoy en memoria — ver §7.                                                 |
| [`src/lib/order-rules.ts`](../src/lib/order-rules.ts)                               | Costo de envío y tope por línea, compartidos entre navegador y servidor.                             |
| [`src/pages/api/checkout.ts`](../src/pages/api/checkout.ts)                         | Carrito → URL de pago.                                                                               |
| [`src/pages/api/tuu/callback.ts`](../src/pages/api/tuu/callback.ts)                 | Notificación firmada. **Fuente de verdad.**                                                          |
| [`src/pages/api/orders/[reference].ts`](../src/pages/api/orders/%5Breference%5D.ts) | Estado de la orden, para la página de resultado.                                                     |
| [`src/pages/pago/exito.astro`](../src/pages/pago/exito.astro)                       | Resultado del pago (consulta, no decide).                                                            |
| [`src/pages/pago/cancelado.astro`](../src/pages/pago/cancelado.astro)               | El comprador canceló. No vacía el carrito.                                                           |

### El sitio sigue siendo estático

`astro.config.mjs` mantiene `output: "static"` y agrega el adapter de Vercel.
Solo las tres rutas con `export const prerender = false` se vuelven funciones
serverless; el catálogo, las fichas y las páginas legales se siguen sirviendo
desde el CDN. Se puede verificar en `.vercel/output/config.json` después de un
`pnpm build`.

---

## 3. Ambientes

No hay ni un solo `if` de ambiente en el código. En Vercel se definen **los
mismos nombres de variable** con valores distintos por environment, así que el
deploy de producción trae credenciales de producción y cualquier rama trae las
de QA.

| `TUU_ENV` | Endpoint                                              | Qué pasa                          |
| --------- | ----------------------------------------------------- | --------------------------------- |
| `qa`      | `https://frontend-api.payment.haulmer.dev/v1/payment` | Webpay simulado. No mueve dinero. |
| `prod`    | `https://core.payment.haulmer.com/api/v1/payment`     | Cobros reales.                    |

### Variables

| Variable          | Production                       | Preview / Development |
| ----------------- | -------------------------------- | --------------------- |
| `TUU_ENV`         | `prod`                           | `qa`                  |
| `TUU_ACCOUNT_ID`  | el que entrega TUU               | `62224230`            |
| `TUU_SECRET_KEY`  | el que entrega TUU (**secreto**) | la pública de la doc  |
| `TUU_SHOP_NAME`   | `Sálvame el PC`                  | `Sálvame el PC (QA)`  |
| `PUBLIC_SITE_URL` | `https://salvameelpc.cl`         | opcional, ver abajo   |

Ninguna lleva prefijo `PUBLIC_` salvo `PUBLIC_SITE_URL`. Astro solo expone al
navegador las que empiezan con `PUBLIC_`, y **la secret key jamás puede salir
del servidor**: quien la tenga puede marcar órdenes como pagadas.

Ver [`.env.example`](../.env.example) para el archivo local.

### `PUBLIC_SITE_URL` y los previews de Vercel

De esta variable salen las tres URLs de retorno. Tiene que ser **HTTPS y sin
slash final**.

En preview no conviene fijarla a mano: cada deploy recibe una URL única con
hash, así que al siguiente push apuntaría a un deploy viejo. Si se omite, el
código se cae solo —en este orden— a `VERCEL_PROJECT_PRODUCTION_URL`,
`VERCEL_BRANCH_URL` (alias estable por rama, el bueno para preview) y
`VERCEL_URL`. Ver [`src/lib/tuu/env.ts`](../src/lib/tuu/env.ts).

**`localhost` no sirve**: TUU tiene que poder llegar al callback desde
internet. Para el flujo completo en local, levanta un túnel y pega su URL:

```bash
cloudflared tunnel --url http://localhost:4321
```

---

## 4. La firma HMAC-SHA256

El mismo algoritmo firma lo que se envía y verifica lo que llega:

1. Tomar solo las claves que empiezan con `x_`, excluyendo `x_signature`.
2. Ordenarlas alfabéticamente (ASCII, case-sensitive).
3. Concatenar `clave + valor` **sin separadores**. Valor vacío ⇒ solo la clave.
4. `HMAC-SHA256(cadena, secret_key)` en hex minúsculas (64 caracteres), UTF-8.

```
x_account_id62224230x_amount19990x_currencyCLPx_customer_email…
```

### Tres trampas que cuestan un día

1. **El ejemplo de PHP de la documentación de TUU no reproduce el hash que
   muestra.** Su array de ejemplo viene recortado con un `// ... otros campos
x_*`. No sirve como test de referencia. El algoritmo sí es correcto: la API
   de QA acepta la firma calculada así y rechaza cualquier variación.
2. **El monto se firma como string sin formato.** `19990` ⇒ `x_amount19990`.
   Si en algún punto se serializa como `19990.0` o `"19.990"`, la firma deja de
   calzar. El tipo `PriceCLP` ya obliga a entero, y `createPaymentIntent`
   vuelve a verificarlo.
3. **La firma se calcula sobre el objeto exacto que se serializa.** Agregar,
   quitar o normalizar un campo después de firmar la invalida. Por eso
   `x_description` se agrega _antes_ de firmar.
4. **De vuelta, TUU informa el monto CON decimal.** Se envía `54990` y el
   callback devuelve `x_amount=54990.0`. La firma se verifica sobre el string
   crudo tal como llegó — normalizarlo a entero antes de verificar la rompe.
   Recién después se compara el valor numérico contra el monto de la orden.
   Hay un test de regresión con datos reales en
   [`signature.test.ts`](../src/lib/tuu/signature.test.ts).

### Cómo detectar un error de la API

TUU **no devuelve un cuerpo de error estructurado**:

| Caso                               | Respuesta                                                |
| ---------------------------------- | -------------------------------------------------------- |
| Firma válida + `X-REDIRECT: false` | `200`, body = la URL en texto plano                      |
| Firma válida sin el header         | `302` con `Location` a la URL del intento                |
| **Firma inválida**                 | `302` a `.../secure/payment-intent/` con el **ID vacío** |

Por eso el cliente exige `status === 200` **y** que el body calce con
`/secure/payment-intent/<id>`. Es la única forma fiable de distinguir éxito de
error.

---

## 5. El monto se calcula en el servidor. Siempre.

El carrito vive en el `localStorage` del visitante: cualquiera puede abrir las
devtools y escribir el precio que quiera.

Por eso el navegador manda **solo ids y cantidades**. `quoteOrder()` relee los
precios del catálogo, aplica las reglas de envío y produce el total que se
firma y se cobra.

> La firma HMAC garantiza que el monto **no se alteró en el camino** — no que
> el monto sea el correcto. Eso lo garantiza `quote.ts`.

Lo mismo con los datos del comprador: `parseCheckoutPayload()` vuelve a correr
en el servidor exactamente las mismas reglas del formulario, porque la
validación del navegador se salta con un `fetch` a mano.

---

## 6. Probar en QA

### Tarjetas de prueba

Solo funcionan en el ambiente de integración.

| Tipo       | Número                | CVV    | Expiración        | Resultado     |
| ---------- | --------------------- | ------ | ----------------- | ------------- |
| VISA       | `4051 8856 0044 6623` | `123`  | cualquiera futura | **Aprobada**  |
| AMEX       | `3700 0000 0002 032`  | `1234` | cualquiera futura | **Aprobada**  |
| MASTERCARD | `5186 0595 5959 0568` | `123`  | cualquiera futura | **Rechazada** |

Después de la tarjeta, el Webpay simulado pide **RUT y clave de banco de
prueba**. Los estándar de Transbank en integración son RUT `11.111.111-1` con
clave `123`.

> ⚠️ **Sin verificar contra el ambiente de TUU.** Confírmalos en la primera
> corrida —la pantalla suele mostrarlos— y actualiza esta tabla. No inventes
> datos ahí.

### Probar el endpoint sin levantar el sitio

```bash
node -e '
const crypto = require("crypto");
const secret = process.env.TUU_SECRET_KEY;
const b = {
  x_account_id: process.env.TUU_ACCOUNT_ID,
  x_amount: 23980, x_currency: "CLP",
  x_customer_email: "ana@ejemplo.cl",
  x_customer_first_name: "Ana", x_customer_last_name: "Soto",
  x_customer_phone: "+56957243741",
  x_reference: "TEST-" + Date.now(),
  x_shop_name: "Sálvame el PC (QA)",
  x_url_callback: "https://example.org/api/tuu/callback",
  x_url_cancel: "https://example.org/pago/cancelado",
  x_url_complete: "https://example.org/pago/exito",
};
b.x_signature = crypto.createHmac("sha256", secret)
  .update(Object.keys(b).sort().map(k => k + b[k]).join(""), "utf8")
  .digest("hex");
fetch("https://frontend-api.payment.haulmer.dev/v1/payment", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-REDIRECT": "false" },
  body: JSON.stringify(b), redirect: "manual",
}).then(r => r.text().then(t => console.log(r.status, t.trim())));
'
```

Debe imprimir `200 https://payment.haulmer.dev/secure/payment-intent/<id>`.
Abrir esa URL lleva directo a Webpay con el monto correcto.

### Simular el callback en local

```bash
curl -i -X POST http://localhost:4321/api/tuu/callback \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "x_account_id=62224230&x_reference=ORD-XXX&x_amount=23980&x_currency=CLP&x_result=completed&x_timestamp=2026-08-31T12:00:00&x_signature=<firma>"
```

Sin firma válida el endpoint responde **400**, que es lo que debe pasar.

### ✅ Confirmado con un pago real en QA (31-08-2026)

Estos puntos estaban abiertos y quedaron resueltos con una transacción
aprobada de verdad en el ambiente de integración.

**1. La verificación de firma funciona.** Un callback legítimo de TUU valida
como `true` con la implementación de
[`signature.ts`](../src/lib/tuu/signature.ts). Confirmado también el orden
ASCII: `x_message` va antes de `x_reference`.

**2. Los parámetros que llegan en la redirección** son:

```
x_account_id, x_amount, x_currency, x_reference,
x_result, x_timestamp, x_message, x_signature
```

La redirección GET trae el juego completo, **incluida la firma**. Aun así
sigue siendo solo presentación: el estado lo escribe el callback POST.

**3. ⚠️ Las URLs de retorno NO pueden llevar query string propia.** TUU pega
sus parámetros con `?` en vez de `&`. Con `x_url_complete` terminado en
`?ref=ORD-123`, el navegador recibe:

```
/pago/exito?ref=ORD-123?x_account_id=62224230&x_amount=54990.0&…

  ref          = "ORD-123?x_account_id=62224230"   ← contaminado
  x_account_id = null                              ← se perdió
```

Por eso `x_url_complete` y `x_url_cancel` van **sin query string**, y las
páginas de resultado leen `x_reference`, que TUU manda igual. Si alguna vez se
necesita pasar un dato propio en la URL de retorno, no se puede por query
string: hay que usar un segmento de ruta.

### Sigue pendiente de verificar

- **El callback POST server-to-server.** Todo lo anterior se observó en la
  redirección GET. Falta confirmar, con un `PUBLIC_SITE_URL` alcanzable desde
  internet (túnel o preview de Vercel), que el POST a `/api/tuu/callback`
  llega, trae los mismos campos y valida la firma. El endpoint loguea el body
  crudo justamente para dejarlo documentado.
- **RUT y clave del banco simulado de Transbank.**

## 7. Paso a producción

### 7.1 La cuenta de TUU la crea el cliente

La cuenta de comercio va **a nombre de la empresa del cliente**, con su RUT y
su cuenta bancaria. No a nombre del desarrollador. Motivos:

- Las liquidaciones caen en la cuenta bancaria del titular.
- Los ingresos quedan asociados a su RUT ante el SII, y es quien emite la
  boleta.
- Los contracargos y reembolsos los responde el titular.
- El contrato con Haulmer lo firma quien vende.
- Al terminar el trabajo, el cliente queda con control total sin depender de
  nadie.

Vale la pena preguntarle a TUU al dar de alta si permiten agregar un **usuario
técnico** a la cuenta del comercio, para ver logs y conciliación sin ser el
titular.

Lo ideal es que el propio cliente pegue `TUU_SECRET_KEY` en el environment
Production de Vercel, sin que la clave pase por correo o mensajería.

### 7.2 Reemplazar el store de órdenes ⚠️ BLOQUEANTE

[`src/lib/orders/store.ts`](../src/lib/orders/store.ts) guarda las órdenes en
un `Map` en memoria. **En Vercel eso no persiste**: cada invocación puede
correr en una instancia distinta y el proceso se recicla. En la práctica, el
callback puede llegar a una instancia que nunca vio la orden, y la página de
éxito puede preguntarle a una tercera.

En local, con un túnel, el proceso es uno solo y el flujo funciona completo.
En preview de Vercel el estado será intermitente. **Esto no puede salir a
producción así.**

Solo hay que reimplementar cuatro funciones con el mismo contrato
(`saveOrder`, `getOrder`, `markOrderResult`, `newOrderReference`); el resto del
código no cambia.

- **Vercel KV / Upstash Redis** — lo más rápido, encaja con serverless.
- **Supabase / Neon (Postgres)** — si además se necesita historial, panel de
  pedidos y consultas. Ya hay un esquema de referencia en
  [`docs/backend-reference/supabase/schema.sql`](backend-reference/supabase/schema.sql)
  (está escrito para Mercado Pago: las columnas `mercadopago_*` pasan a ser
  `tuu_reference` / `tuu_payment_id`).

Con base de datos, agregar además:

- Índice **único** sobre `reference`, para que un reintento del callback no
  duplique nada.
- Estado `pending` con **expiración**: una orden que nunca recibe callback debe
  quedar marcada para revisión manual, no colgada para siempre.
- **Registro de cada intento de callback** (payload, IP, timestamp, respuesta).
  Es lo que se necesita para conciliar con TUU si aparece una diferencia.

### 7.3 Lo que queda pendiente en el callback

`/api/tuu/callback` marca la orden como pagada, pero el `TODO(pagos)` está sin
implementar: correo de confirmación al comprador, aviso al equipo, descuento de
stock y emisión de boleta.

El correo de confirmación **no es opcional**: la Ley 19.496 obliga a enviar
confirmación escrita del pedido, y si no llega, el plazo de retracto del
comprador se extiende de 10 a 90 días corridos. Está dicho en los
[términos y condiciones](../src/pages/terminos-y-condiciones.astro) del sitio.

### 7.4 Checklist

- [ ] Cuenta de comercio en TUU a nombre de la empresa del cliente, activa.
- [ ] `TUU_ENV=prod` y credenciales reales **solo** en el environment
      Production de Vercel.
- [ ] `PUBLIC_SITE_URL` apuntando al dominio real, HTTPS, sin slash final.
- [ ] La secret key no aparece en el repo, ni en logs, ni en ninguna variable
      con prefijo `PUBLIC_`.
- [ ] **Store de órdenes reemplazado por una base de datos** (§7.2).
- [ ] Correo de confirmación de pedido implementado (§7.3).
- [ ] Datos legales reales cargados en `LEGAL` de
      [`src/config/site.ts`](../src/config/site.ts) — razón social, RUT y
      domicilio. Deben ser los mismos de la cuenta de TUU.
- [ ] `/api/tuu/callback` responde 200 en menos de 5 s y es idempotente.
- [ ] Se registra el payload completo de cada callback para conciliar.
- [ ] Probado el camino feliz, el rechazado (MASTERCARD de prueba) y la
      cancelación explícita del usuario.
- [ ] Probado qué pasa si el comprador cierra la ventana a mitad del pago: la
      orden queda `pending` y el callback la resuelve igual.

---

## 8. Referencias

- [TUU — Iniciar pago online](https://developers.tuu.cl/docs/payment-intent)
- [Portal de integraciones TUU](https://developers.tuu.cl/docs/getting-started)
