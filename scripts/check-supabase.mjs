/**
 * ─────────────────────────────────────────────────────────────────────────
 * VERIFICACIÓN DE LA BASE DE SUPABASE
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   pnpm check:supabase
 *
 * Comprueba que supabase/schema.sql quedó bien aplicado: que el seed está
 * completo y —lo que de verdad importa— que el Row Level Security protege
 * lo que tiene que proteger.
 *
 * Habla por HTTP contra PostgREST con `fetch` en vez de usar
 * @supabase/supabase-js a propósito: así se puede correr ANTES de instalar
 * nada, y prueba exactamente la misma superficie que queda expuesta a
 * internet con la clave pública.
 *
 * Las pruebas de seguridad están escritas al revés que las demás: pasan
 * cuando la petición FALLA. Un 200 en cualquiera de ellas es el hallazgo.
 */

const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon) {
  console.error(
    "Faltan SUPABASE_URL y/o SUPABASE_ANON_KEY.\n" +
      "Pégalas en .env (ver .env.example) y vuelve a correr.",
  );
  process.exit(1);
}

let fallos = 0;

function ok(mensaje, detalle = "") {
  console.log(`  \x1b[32m✓\x1b[0m ${mensaje}${detalle ? `  \x1b[90m${detalle}\x1b[0m` : ""}`);
}

function fallo(mensaje, detalle = "") {
  fallos += 1;
  console.log(`  \x1b[31m✗\x1b[0m ${mensaje}${detalle ? `  \x1b[90m${detalle}\x1b[0m` : ""}`);
}

function titulo(texto) {
  console.log(`\n\x1b[1m${texto}\x1b[0m`);
}

const headers = (key, extra = {}) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  ...extra,
});

/**
 * Cuenta filas sin traérselas: PostgREST responde el total en Content-Range.
 *
 * Va por HEAD y no por GET con `select=id`: site_settings se identifica por
 * `key` y no tiene columna id, así que pedir una columna concreta obliga a
 * saber de antemano cómo está hecha cada tabla. HEAD no devuelve cuerpo y
 * sirve igual para todas.
 */
async function contar(tabla, key = anon) {
  const res = await fetch(`${url}/rest/v1/${tabla}?select=*`, {
    method: "HEAD",
    headers: headers(key, { Prefer: "count=exact", Range: "0-0" }),
  });
  if (!res.ok) {
    // HEAD no trae cuerpo, así que el detalle del error se pide aparte.
    const detalle = await fetch(`${url}/rest/v1/${tabla}?select=*&limit=1`, {
      headers: headers(key),
    })
      .then((r) => r.text())
      .catch(() => "");
    return { error: `HTTP ${res.status} ${detalle.slice(0, 120)}` };
  }
  const rango = res.headers.get("content-range") ?? "";
  return { total: Number(rango.split("/")[1]) };
}

async function esperarConteo(tabla, esperado) {
  const { total, error } = await contar(tabla);
  if (error) return fallo(`${tabla}`, error);
  if (total === esperado) return ok(`${tabla}`, `${total} filas`);
  fallo(`${tabla}`, `esperaba ${esperado}, hay ${total}`);
}

console.log(`\nProyecto: ${url}`);

// ── 1. ¿Llegó el seed completo? ──────────────────────────────────────────
titulo("Seed");
await esperarConteo("products", 12);
await esperarConteo("pages", 9);
await esperarConteo("page_sections", 18);
await esperarConteo("site_settings", 26);
await esperarConteo("legal_documents", 2);
await esperarConteo("legal_sections", 24);

// ── 2. ¿El contenido se lee como lo va a leer el sitio? ──────────────────
titulo("Lectura pública (la que usa el build del sitio)");
{
  const res = await fetch(
    `${url}/rest/v1/products?select=slug,name,price_clp,specs&is_featured=eq.true&order=sort_order`,
    { headers: headers(anon) },
  );
  const datos = res.ok ? await res.json() : null;
  if (!res.ok) fallo("Destacados", `HTTP ${res.status}`);
  else if (datos.length === 4) ok("Destacados", datos.map((p) => p.slug).join(", "));
  else fallo("Destacados", `esperaba 4, hay ${datos.length}`);
}
{
  const res = await fetch(`${url}/rest/v1/site_settings?select=value&key=eq.promo.text`, {
    headers: headers(anon),
  });
  const datos = res.ok ? await res.json() : [];
  if (datos[0]?.value) ok("Cintillo promocional", `"${datos[0].value}"`);
  else fallo("Cintillo promocional", `HTTP ${res.status}`);
}

// ── 3. Seguridad. Acá "pasar" significa que la petición fue RECHAZADA. ───
titulo("RLS con la clave pública (la que viaja en el navegador)");
{
  const { total, error } = await contar("orders");
  if (error) ok("Pedidos invisibles", "la tabla ni se deja consultar");
  else if (total === 0) ok("Pedidos invisibles", "0 filas devueltas por RLS");
  else fallo("⚠️  PEDIDOS EXPUESTOS", `devolvió ${total} filas con la clave pública`);
}
{
  const res = await fetch(`${url}/rest/v1/products`, {
    method: "POST",
    headers: headers(anon, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      slug: `intruso-${Date.now()}`,
      name: "Intruso",
      brand: "X",
      category: "GPU",
      price_clp: 1,
    }),
  });
  if (res.ok) fallo("⚠️  ESCRITURA ABIERTA", "un anónimo pudo crear un producto");
  else ok("Escritura bloqueada", `HTTP ${res.status}`);
}
{
  // La más importante: sin este bloqueo, cualquiera marca sus pedidos como
  // pagados con la clave que lleva en el navegador.
  const res = await fetch(`${url}/rest/v1/rpc/settle_order`, {
    method: "POST",
    headers: headers(anon, { "Content-Type": "application/json" }),
    body: JSON.stringify({ p_reference: "ORD-SONDEO", p_status: "completed" }),
  });
  if (res.ok) fallo("⚠️  settle_order EXPUESTA", "se puede cerrar un pedido desde el navegador");
  else ok("settle_order inalcanzable", `HTTP ${res.status}`);
}

// ── 4. El servidor sí puede operar ───────────────────────────────────────
titulo("Clave de servicio (solo servidor)");
if (!service) {
  console.log("  \x1b[90m—\x1b[0m SUPABASE_SERVICE_ROLE_KEY no está en .env, se omite");
} else {
  const { total, error } = await contar("orders", service);
  if (error) fallo("Lee pedidos", error);
  else ok("Lee pedidos", `${total} en la base`);

  const res = await fetch(`${url}/rest/v1/rpc/settle_order`, {
    method: "POST",
    headers: headers(service, { "Content-Type": "application/json" }),
    body: JSON.stringify({ p_reference: "ORD-NO-EXISTE", p_status: "failed" }),
  });
  const valor = res.ok ? await res.json() : null;
  if (valor === false) ok("settle_order responde", "false ante una referencia desconocida");
  else fallo("settle_order", `HTTP ${res.status}, devolvió ${JSON.stringify(valor)}`);
}

// ── 5. Storage ───────────────────────────────────────────────────────────
titulo("Storage");
{
  const res = await fetch(`${url}/storage/v1/object/public/media/no-existe.png`);
  // 400/404 = el bucket responde. 404 con "Bucket not found" = no se creó.
  const cuerpo = await res.text();
  if (/bucket not found/i.test(cuerpo)) fallo("Bucket `media`", "no existe");
  else ok("Bucket `media`", "existe y sirve archivos públicos");
}

console.log(
  fallos === 0
    ? "\n\x1b[32m✓ Todo correcto.\x1b[0m\n"
    : `\n\x1b[31m✗ ${fallos} problema(s).\x1b[0m\n`,
);
process.exit(fallos === 0 ? 0 : 1);
