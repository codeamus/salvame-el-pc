import { describe, expect, it } from "vitest";
import { buildSignatureBase, safeEqual, signPayload, verifySignature } from "@/lib/tuu/signature";

const SECRET = "clave-de-prueba";

describe("buildSignatureBase", () => {
  it("ordena las claves alfabéticamente y concatena sin separadores", () => {
    const base = buildSignatureBase({ x_currency: "CLP", x_amount: 19990, x_account_id: "622" });

    expect(base).toBe("x_account_id622x_amount19990x_currencyCLP");
  });

  it("excluye x_signature: la firma no se firma a sí misma", () => {
    const base = buildSignatureBase({ x_amount: 100, x_signature: "deadbeef" });

    expect(base).toBe("x_amount100");
  });

  it("ignora las claves que no empiezan con x_", () => {
    const base = buildSignatureBase({ x_amount: 100, monto: 999, _interno: "no" });

    expect(base).toBe("x_amount100");
  });

  it("con valor vacío deja solo la clave", () => {
    // x_message va sin valor; x_amount sí aporta el suyo.
    expect(buildSignatureBase({ x_message: "", x_amount: 100 })).toBe("x_amount100x_message");
  });

  it("omite los campos opcionales que no se enviaron", () => {
    const base = buildSignatureBase({ x_amount: 100, x_description: undefined });

    expect(base).toBe("x_amount100");
  });

  it("serializa el monto como entero, sin decimales ni separadores", () => {
    // Es la trampa clásica: si el monto se serializa como "19990.0" o
    // "19.990" la firma deja de calzar y TUU responde un 302 sin explicación.
    expect(buildSignatureBase({ x_amount: 19990 })).toBe("x_amount19990");
    expect(buildSignatureBase({ x_amount: 19990 })).not.toContain(".");
  });

  it("ordena por ASCII, así que respeta mayúsculas y minúsculas", () => {
    expect(buildSignatureBase({ x_b: "1", x_A: "2" })).toBe("x_A2x_b1");
  });
});

describe("signPayload", () => {
  it("devuelve 64 caracteres hex en minúscula", async () => {
    const firma = await signPayload({ x_amount: 19990 }, SECRET);

    expect(firma).toMatch(/^[0-9a-f]{64}$/);
  });

  it("es estable: el mismo payload da siempre la misma firma", async () => {
    const payload = { x_account_id: "622", x_amount: 19990 };

    expect(await signPayload(payload, SECRET)).toBe(await signPayload(payload, SECRET));
  });

  it("no depende del orden en que se escribieron las claves", async () => {
    const a = await signPayload({ x_amount: 19990, x_account_id: "622" }, SECRET);
    const b = await signPayload({ x_account_id: "622", x_amount: 19990 }, SECRET);

    expect(a).toBe(b);
  });

  it("cambia si cambia el monto", async () => {
    const original = await signPayload({ x_amount: 19990 }, SECRET);
    const alterado = await signPayload({ x_amount: 1 }, SECRET);

    expect(alterado).not.toBe(original);
  });

  it("cambia si cambia la secret key", async () => {
    const payload = { x_amount: 19990 };

    expect(await signPayload(payload, SECRET)).not.toBe(await signPayload(payload, "otra"));
  });
});

describe("safeEqual", () => {
  it("acepta strings idénticos", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
  });

  it("rechaza strings distintos del mismo largo", () => {
    expect(safeEqual("abc", "abd")).toBe(false);
  });

  it("rechaza strings de distinto largo", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("verifySignature", () => {
  it("acepta una firma calculada con la misma clave", async () => {
    const params = { x_reference: "ORD-1", x_amount: "19990", x_result: "completed" };
    const firma = await signPayload(params, SECRET);

    expect(await verifySignature(params, firma, SECRET)).toBe(true);
  });

  it("rechaza si alguien alteró el monto después de firmar", async () => {
    const params = { x_reference: "ORD-1", x_amount: "19990", x_result: "completed" };
    const firma = await signPayload(params, SECRET);

    const alterado = { ...params, x_amount: "1" };

    expect(await verifySignature(alterado, firma, SECRET)).toBe(false);
  });

  it("rechaza si alguien intenta marcar la orden como pagada", async () => {
    const params = { x_reference: "ORD-1", x_amount: "19990", x_result: "failed" };
    const firma = await signPayload(params, SECRET);

    expect(await verifySignature({ ...params, x_result: "completed" }, firma, SECRET)).toBe(false);
  });

  it("rechaza una firma hecha con otra clave", async () => {
    const params = { x_reference: "ORD-1" };
    const firma = await signPayload(params, "clave-del-atacante");

    expect(await verifySignature(params, firma, SECRET)).toBe(false);
  });

  it("acepta la firma en mayúsculas: solo cambia cómo se escribió el hex", async () => {
    const params = { x_reference: "ORD-1" };
    const firma = await signPayload(params, SECRET);

    expect(await verifySignature(params, firma.toUpperCase(), SECRET)).toBe(true);
  });

  it("rechaza una firma vacía", async () => {
    expect(await verifySignature({ x_reference: "ORD-1" }, "", SECRET)).toBe(false);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * REGRESIÓN CON DATOS REALES DE QA
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Capturados de una redirección auténtica de TUU tras un pago aprobado en el
 * ambiente de integración (31-08-2026). La secret key es la pública de QA,
 * la misma que está en .env.example.
 *
 * Este bloque existe porque documenta dos comportamientos que la
 * documentación de TUU no menciona y que solo se ven con un pago real.
 */
describe("callback real de TUU (QA)", () => {
  const SECRET_QA =
    "yAk0dXTJLQzkeEWODsQWVpPX0bn7ND50qwoQrXgqqNiUyEpgxIPxPtoCgKeLNeh1upTw72JZx5O9x5IaAtPIGUAVcMNcsUSg3M0M8tgWdUb4F8qkS8I7rHpOUmZqzvfS";

  const PARAMS_REALES = {
    x_account_id: "62224230",
    x_amount: "54990.0",
    x_currency: "CLP",
    x_reference: "ORD-20260831-E6032137",
    x_result: "completed",
    x_timestamp: "2026-08-31T15:21:50Z",
    x_message: "Transaccion aprobada",
  };

  const FIRMA_REAL = "00ed63e966b4896f96cb09e49d5e7b818912972da47f86416c2a6fdc46d422b0";

  it("verifica la firma de un pago real aprobado", async () => {
    expect(await verifySignature(PARAMS_REALES, FIRMA_REAL, SECRET_QA)).toBe(true);
  });

  it("TUU devuelve el monto CON decimal, y así hay que verificarlo", async () => {
    // De ida el monto se envía como entero (54990); de vuelta TUU lo informa
    // como "54990.0". Normalizarlo antes de verificar ROMPE la firma. Se
    // verifica el string crudo tal como llegó, y recién después se compara el
    // valor numérico contra el monto de la orden.
    const normalizado = { ...PARAMS_REALES, x_amount: "54990" };

    expect(await verifySignature(normalizado, FIRMA_REAL, SECRET_QA)).toBe(false);
    expect(Number(PARAMS_REALES.x_amount)).toBe(54990);
  });

  it("el orden alfabético pone x_message antes de x_reference", () => {
    // Confirmación de que el orden ASCII del algoritmo calza con el que usa
    // TUU: si estuviera invertido, la firma real no validaría.
    expect(buildSignatureBase(PARAMS_REALES)).toContain(
      "x_messageTransaccion aprobadax_referenceORD-20260831-E6032137",
    );
  });
});
