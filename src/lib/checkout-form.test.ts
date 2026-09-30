import { describe, expect, it } from "vitest";
import {
  EMPTY_CHECKOUT_FORM,
  isCheckoutValid,
  shippingForMethod,
  toCheckoutPayload,
  validateCheckout,
  validateField,
  type CheckoutForm,
} from "@/lib/checkout-form";

function makeForm(overrides: Partial<CheckoutForm> = {}): CheckoutForm {
  return {
    entrega: "despacho",
    nombre: "Ana Soto",
    rut: "12.345.678-5",
    correo: "ana@gmail.com",
    telefono: "+56 9 5724 3741",
    region: "Metropolitana de Santiago",
    comuna: "Providencia",
    calle: "Av. Providencia 1234",
    referencia: "Depto 501",
    ...overrides,
  };
}

describe("validateCheckout", () => {
  it("no encuentra errores en un formulario completo y correcto", () => {
    expect(validateCheckout(makeForm())).toEqual({});
    expect(isCheckoutValid(makeForm())).toBe(true);
  });

  it("marca todos los campos obligatorios cuando está vacío", () => {
    const errors = validateCheckout(EMPTY_CHECKOUT_FORM);

    expect(Object.keys(errors).sort()).toEqual([
      "calle",
      "comuna",
      "correo",
      "nombre",
      "region",
      "rut",
      "telefono",
    ]);
    // La referencia es opcional: vacía no es un error.
    expect(errors.referencia).toBeUndefined();
  });
});

describe("validateField", () => {
  it("rechaza un RUT con dígito verificador equivocado", () => {
    expect(validateField("rut", makeForm({ rut: "12.345.678-9" }))).toMatch(/dígito verificador/i);
  });

  it("rechaza un teléfono que sean puras letras o números sueltos", () => {
    expect(validateField("telefono", makeForm({ telefono: "hola" }))).toBeDefined();
    expect(validateField("telefono", makeForm({ telefono: "12345" }))).toBeDefined();
    expect(validateField("telefono", makeForm({ telefono: "+56 9 5724 3741" }))).toBeUndefined();
  });

  it("rechaza un nombre sin apellido", () => {
    expect(validateField("nombre", makeForm({ nombre: "Ana" }))).toBeDefined();
  });

  it("rechaza un correo mal escrito", () => {
    expect(validateField("correo", makeForm({ correo: "ana@gmail" }))).toBeDefined();
  });

  it("pide la región antes que la comuna", () => {
    const error = validateField("comuna", makeForm({ region: "", comuna: "" }));
    expect(error).toBe("Primero elige tu región.");
  });

  it("rechaza una comuna que no pertenece a la región elegida", () => {
    const form = makeForm({ region: "Valparaíso", comuna: "Providencia" });
    expect(validateField("comuna", form)).toMatch(/no pertenece a la región/i);
  });

  it("acepta la comuna cuando sí pertenece a la región", () => {
    const form = makeForm({ region: "Valparaíso", comuna: "Viña del Mar" });
    expect(validateField("comuna", form)).toBeUndefined();
  });

  it("exige número en la dirección", () => {
    expect(validateField("calle", makeForm({ calle: "Av. Providencia" }))).toMatch(/número/i);
  });

  it("acota el largo de la referencia opcional", () => {
    expect(validateField("referencia", makeForm({ referencia: "" }))).toBeUndefined();
    expect(validateField("referencia", makeForm({ referencia: "x".repeat(121) }))).toBeDefined();
  });
});

describe("formas de entrega", () => {
  it("con despacho exige la dirección completa", () => {
    const errors = validateCheckout(
      makeForm({ entrega: "despacho", region: "", comuna: "", calle: "" }),
    );

    expect(errors.region).toBeDefined();
    expect(errors.comuna).toBeDefined();
    expect(errors.calle).toBeDefined();
  });

  it("con entrega a acordar no pide dirección de ningún tipo", () => {
    const form = makeForm({
      entrega: "acordar",
      region: "",
      comuna: "",
      calle: "",
      referencia: "",
    });

    expect(validateCheckout(form)).toEqual({});
    expect(isCheckoutValid(form)).toBe(true);
  });

  it("con entrega a acordar sigue exigiendo los datos de contacto", () => {
    const errors = validateCheckout({ ...EMPTY_CHECKOUT_FORM, entrega: "acordar" });

    expect(Object.keys(errors).sort()).toEqual(["correo", "nombre", "rut", "telefono"]);
  });

  it("ignora una dirección inválida que quedó escrita antes de cambiar a acordar", () => {
    const form = makeForm({ entrega: "acordar", region: "Valparaíso", comuna: "Providencia" });

    expect(validateField("comuna", form)).toBeUndefined();
  });

  it("rechaza una forma de entrega que no existe", () => {
    const form = { ...makeForm(), entrega: "teletransporte" } as unknown as CheckoutForm;
    expect(validateField("entrega", form)).toBeDefined();
  });
});

describe("shippingForMethod", () => {
  it("cobra el envío solo cuando hay despacho", () => {
    expect(shippingForMethod("despacho", 3990)).toBe(3990);
    expect(shippingForMethod("acordar", 3990)).toBe(0);
  });
});

describe("toCheckoutPayload", () => {
  it("normaliza los datos para el backend", () => {
    const payload = toCheckoutPayload(
      makeForm({
        nombre: "  Ana   Soto ",
        correo: "  ANA@Gmail.COM ",
        telefono: "+56 9 5724 3741",
        calle: "Av.  Providencia   1234",
      }),
    );

    expect(payload).toEqual({
      entrega: "despacho",
      nombre: "Ana Soto",
      rut: "12.345.678-5",
      correo: "ana@gmail.com",
      telefono: "+56957243741",
      direccion: {
        region: "Metropolitana de Santiago",
        comuna: "Providencia",
        calle: "Av. Providencia 1234",
        referencia: "Depto 501",
      },
    });
  });

  it("manda la dirección en null cuando la entrega se acuerda", () => {
    const payload = toCheckoutPayload(makeForm({ entrega: "acordar" }));

    expect(payload.entrega).toBe("acordar");
    expect(payload.direccion).toBeNull();
  });
});
