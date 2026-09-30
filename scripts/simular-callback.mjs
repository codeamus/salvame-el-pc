/**
 * ─────────────────────────────────────────────────────────────────────────
 * SIMULADOR DEL CALLBACK DE TUU
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   pnpm sim:callback ORD-20260913-2B467BF6           # marca como pagada
 *   pnpm sim:callback ORD-20260913-2B467BF6 failed    # marca como rechazada
 *
 * Manda a /api/tuu/callback un POST firmado idéntico al que manda TUU:
 * mismo Content-Type de formulario, misma firma HMAC, mismos campos y —lo
 * que importa— SIN header Origin, porque lo manda un servidor y no un
 * navegador.
 *
 * Sirve para dos cosas:
 *
 *   1. Desatascar una orden que quedó en "pending" durante una prueba.
 *   2. Reproducir en un segundo la clase de fallo que costó encontrar la
 *      primera vez: Astro rechazaba el callback con 403 por su protección
 *      CSRF antes de que llegara a la ruta. Si alguien vuelve a activar
 *      `security.checkOrigin`, este script lo detecta al instante.
 *
 * El monto lo lee de la propia orden en Supabase en vez de pedirlo por
 * parámetro: el callback se rechaza si el monto no calza con lo cotizado, y
 * un typo acá parecería un bug del endpoint.
 *
 * ⚠️ Solo para QA. Marca órdenes como pagadas sin que haya pagado nadie.
 */

import crypto from "node:crypto";

const [, , reference, resultado = "completed"] = process.argv;

if (reference === undefined) {
  console.error("Uso: pnpm sim:callback <referencia> [completed|failed]");
  process.exit(1);
}

if (process.env.TUU_ENV === "prod") {
  console.error("✗ TUU_ENV=prod. Este script no se corre contra producción.");
  process.exit(1);
}

const site = process.env.PUBLIC_SITE_URL?.replace(/\/+$/, "");
const supabase = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const secret = process.env.TUU_SECRET_KEY;

if (!site || !supabase || !service || !secret) {
  console.error(
    "Faltan PUBLIC_SITE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o TUU_SECRET_KEY.",
  );
  process.exit(1);
}

// 1. El monto sale de la orden, no de un argumento.
const res = await fetch(
  `${supabase}/rest/v1/orders?select=reference,amount_clp,status&reference=eq.${encodeURIComponent(reference)}`,
  { headers: { apikey: service, Authorization: `Bearer ${service}` } },
);
const [orden] = await res.json();

if (orden === undefined) {
  console.error(`✗ No existe la orden ${reference} en Supabase.`);
  process.exit(1);
}

console.log(`Orden ${orden.reference} — estado actual: ${orden.status}, monto ${orden.amount_clp}`);

// 2. Firma sobre el objeto EXACTO que se serializa: claves x_ ordenadas,
//    clave+valor concatenados sin separador. Igual que src/lib/tuu/signature.ts.
const cuerpo = {
  x_account_id: process.env.TUU_ACCOUNT_ID,
  // TUU manda el monto con decimal ("54990.0"); el endpoint lo compara con
  // Number(), así que esto reproduce el formato real y no uno cómodo.
  x_amount: `${orden.amount_clp}.0`,
  x_currency: "CLP",
  x_message: "SIMULADO",
  x_reference: orden.reference,
  x_result: resultado,
  x_timestamp: new Date().toISOString(),
};

cuerpo.x_signature = crypto
  .createHmac("sha256", secret)
  .update(
    Object.keys(cuerpo)
      .sort()
      .map((k) => k + cuerpo[k])
      .join(""),
    "utf8",
  )
  .digest("hex");

// 3. POST como lo haría TUU.
const callback = await fetch(`${site}/api/tuu/callback`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(cuerpo),
});

const texto = (await callback.text()).trim();
console.log(`\n→ ${site}/api/tuu/callback`);
console.log(`   HTTP ${callback.status} ${texto}`);

if (callback.status === 403 && texto.includes("Cross-site")) {
  console.error(
    "\n✗ Astro está bloqueando el callback por CSRF.\n" +
      "  Revisa que `security.checkOrigin: false` siga en astro.config.mjs\n" +
      "  y REINICIA el dev server: la config no se recarga sola.",
  );
  process.exit(1);
}

if (!callback.ok) {
  console.error("\n✗ El endpoint no aceptó el callback.");
  process.exit(1);
}

// 4. ¿Cambió de verdad en la base?
const verificacion = await fetch(
  `${supabase}/rest/v1/orders?select=status,last_notification&reference=eq.${encodeURIComponent(reference)}`,
  { headers: { apikey: service, Authorization: `Bearer ${service}` } },
);
const [final] = await verificacion.json();

console.log(`\nEstado en Supabase: ${orden.status} → ${final.status}`);
console.log(
  final.last_notification
    ? "Callback guardado en last_notification ✓"
    : "⚠️  sin callback guardado",
);

if (final.status === "pending") {
  console.error(
    "\n✗ El endpoint respondió 200 pero la orden sigue pendiente. Revisa el log del server.",
  );
  process.exit(1);
}

console.log("\n✓ Listo. La página /pago/exito debería cambiar sola en unos segundos.");
