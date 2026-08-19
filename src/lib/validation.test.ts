import { describe, expect, it } from "vitest";
import {
  cleanPhone,
  cleanRut,
  computeRutDv,
  formatPhone,
  formatPhoneInternational,
  formatRut,
  isMobilePhone,
  isValidEmail,
  isValidFullName,
  isValidPhone,
  isValidRut,
  isValidStreetAddress,
  normalizeSpaces,
  toE164Phone,
} from "@/lib/validation";

describe("cleanRut", () => {
  it("saca puntos, guion y espacios, y sube la K", () => {
    expect(cleanRut("12.345.678-k")).toBe("12345678K");
    expect(cleanRut(" 9.876.543 - 2 ")).toBe("98765432");
  });
});

describe("computeRutDv", () => {
  it.each([
    ["11111111", "1"],
    ["12345678", "5"],
    ["18765432", "7"],
    ["7654321", "6"],
  ])("el DV de %s es %s", (body, dv) => {
    expect(computeRutDv(body)).toBe(dv);
  });

  it("devuelve K cuando el resto da 10", () => {
    expect(computeRutDv("14000006")).toBe("K");
  });

  it("devuelve 0 cuando el resto da 11", () => {
    expect(computeRutDv("14000000")).toBe("0");
  });
});

describe("formatRut", () => {
  it("puntea el cuerpo y separa el dígito verificador", () => {
    expect(formatRut("123456785")).toBe("12.345.678-5");
    expect(formatRut("14000006K")).toBe("14.000.006-K");
  });

  it("formatea de forma progresiva mientras se escribe", () => {
    expect(formatRut("")).toBe("");
    expect(formatRut("1")).toBe("1");
    expect(formatRut("12")).toBe("1-2");
    expect(formatRut("1234")).toBe("123-4");
    expect(formatRut("12345")).toBe("1.234-5");
  });

  it("es idempotente: reformatear un RUT ya formateado no lo rompe", () => {
    expect(formatRut(formatRut("123456785"))).toBe("12.345.678-5");
  });

  it("ignora lo que no sea dígito o K", () => {
    expect(formatRut("12ab345cd678-5")).toBe("12.345.678-5");
  });
});

describe("isValidRut", () => {
  it("acepta RUT válidos en cualquier formato de entrada", () => {
    expect(isValidRut("12.345.678-5")).toBe(true);
    expect(isValidRut("123456785")).toBe(true);
    expect(isValidRut("12345678-5")).toBe(true);
    expect(isValidRut("11.111.111-1")).toBe(true);
  });

  it("acepta el dígito verificador K en minúscula", () => {
    expect(isValidRut("14.000.006-k")).toBe(true);
    expect(isValidRut("14.000.006-K")).toBe(true);
  });

  it("rechaza un dígito verificador que no corresponde", () => {
    expect(isValidRut("12.345.678-9")).toBe(false);
    expect(isValidRut("11.111.111-2")).toBe(false);
  });

  it("rechaza cuerpos demasiado cortos o largos", () => {
    expect(isValidRut("1234-5")).toBe(false);
    expect(isValidRut("1234567890123")).toBe(false);
  });

  it("rechaza texto y vacío", () => {
    expect(isValidRut("")).toBe(false);
    expect(isValidRut("no soy un rut")).toBe(false);
    expect(isValidRut("K")).toBe(false);
  });

  it("rechaza una K en el cuerpo (solo puede ir en el DV)", () => {
    expect(isValidRut("1K345678-5")).toBe(false);
  });
});

describe("cleanPhone", () => {
  it("descarta el prefijo país en todas sus formas", () => {
    expect(cleanPhone("+56957243741")).toBe("957243741");
    expect(cleanPhone("56957243741")).toBe("957243741");
    expect(cleanPhone("0056957243741")).toBe("957243741");
    expect(cleanPhone("957243741")).toBe("957243741");
  });

  it("descarta separadores", () => {
    expect(cleanPhone("+56 9 5724 3741")).toBe("957243741");
    expect(cleanPhone("(+56) 9-5724-3741")).toBe("957243741");
  });
});

describe("formatPhone", () => {
  it("formatea la parte nacional, sin el prefijo país", () => {
    expect(formatPhone("957243741")).toBe("9 5724 3741");
    expect(formatPhone("+56957243741")).toBe("9 5724 3741");
  });

  it("formatea de forma progresiva", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("9")).toBe("9");
    expect(formatPhone("957")).toBe("9 57");
    expect(formatPhone("95724")).toBe("9 5724");
    expect(formatPhone("9572437")).toBe("9 5724 37");
  });

  it("es idempotente", () => {
    expect(formatPhone(formatPhone("957243741"))).toBe("9 5724 3741");
  });

  it("no deja escribir más de 9 dígitos nacionales", () => {
    expect(formatPhone("9572437419999")).toBe("9 5724 3741");
  });

  it("no confunde un código de área que empieza en 5 con el prefijo país", () => {
    // 51 = La Serena. Sin "+" y con 9 dígitos, es un fijo, no un +56.
    expect(formatPhone("512345678")).toBe("5 1234 5678");
  });

  it("se corrige solo si el usuario termina de escribir el código país", () => {
    expect(formatPhone("56957243741")).toBe("9 5724 3741");
  });
});

describe("formatPhoneInternational", () => {
  it("antepone el prefijo país para mostrar", () => {
    expect(formatPhoneInternational("957243741")).toBe("+56 9 5724 3741");
    expect(formatPhoneInternational("")).toBe("");
  });
});

describe("isValidPhone", () => {
  it("acepta móviles chilenos", () => {
    expect(isValidPhone("+56 9 5724 3741")).toBe(true);
    expect(isValidPhone("+56957243741")).toBe(true);
    expect(isValidPhone("957243741")).toBe(true);
  });

  it("acepta fijos con código de área", () => {
    expect(isValidPhone("+56 2 2345 6789")).toBe(true);
    expect(isValidPhone("+56 41 2345 678")).toBe(true);
  });

  it("rechaza largos que no sean 9 dígitos", () => {
    expect(isValidPhone("+56 9 5724 374")).toBe(false);
    expect(isValidPhone("12345")).toBe(false);
  });

  it("rechaza prefijos de servicio (0 y 1)", () => {
    expect(isValidPhone("123456789")).toBe(false);
    expect(isValidPhone("+56 0 5724 3741")).toBe(false);
  });

  it("rechaza letras y vacío", () => {
    expect(isValidPhone("")).toBe(false);
    expect(isValidPhone("no es un teléfono")).toBe(false);
    expect(isValidPhone("abcdefghi")).toBe(false);
  });
});

describe("isMobilePhone", () => {
  it("distingue móvil de fijo", () => {
    expect(isMobilePhone("+56 9 5724 3741")).toBe(true);
    expect(isMobilePhone("+56 2 2345 6789")).toBe(false);
  });
});

describe("toE164Phone", () => {
  it("normaliza a la forma que espera un backend", () => {
    expect(toE164Phone("+56 9 5724 3741")).toBe("+56957243741");
    expect(toE164Phone("957243741")).toBe("+56957243741");
  });
});

describe("isValidEmail", () => {
  it("acepta correos normales", () => {
    expect(isValidEmail("ana.soto@gmail.com")).toBe(true);
    expect(isValidEmail("ANA@EMPRESA.CL")).toBe(true);
    expect(isValidEmail("a+etiqueta@sub.dominio.co.uk")).toBe(true);
    expect(isValidEmail("  ana@gmail.com  ")).toBe(true);
  });

  it("rechaza los errores de tipeo típicos", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("ana")).toBe(false);
    expect(isValidEmail("ana@")).toBe(false);
    expect(isValidEmail("ana@gmail")).toBe(false);
    expect(isValidEmail("ana@gmail.")).toBe(false);
    expect(isValidEmail("@gmail.com")).toBe(false);
    expect(isValidEmail("ana soto@gmail.com")).toBe(false);
    expect(isValidEmail("ana@@gmail.com")).toBe(false);
  });

  it("rechaza correos absurdamente largos", () => {
    expect(isValidEmail(`${"a".repeat(250)}@gmail.com`)).toBe(false);
  });
});

describe("isValidFullName", () => {
  it("acepta nombre y apellido con tildes, ñ, guiones y apóstrofes", () => {
    expect(isValidFullName("Ana Soto")).toBe(true);
    expect(isValidFullName("José Muñoz Peña")).toBe(true);
    expect(isValidFullName("Ana-María O'Brien")).toBe(true);
    expect(isValidFullName("  Ana   Soto  ")).toBe(true);
  });

  it("exige al menos dos palabras", () => {
    expect(isValidFullName("Ana")).toBe(false);
    expect(isValidFullName("")).toBe(false);
  });

  it("rechaza números y símbolos", () => {
    expect(isValidFullName("Ana Soto 123")).toBe(false);
    expect(isValidFullName("12345678")).toBe(false);
    expect(isValidFullName("<script> alert")).toBe(false);
  });
});

describe("normalizeSpaces", () => {
  it("colapsa espacios y recorta", () => {
    expect(normalizeSpaces("  Ana   Soto ")).toBe("Ana Soto");
  });
});

describe("isValidStreetAddress", () => {
  it("exige número en la dirección", () => {
    expect(isValidStreetAddress("Av. Providencia 1234")).toBe(true);
    expect(isValidStreetAddress("Av. Providencia")).toBe(false);
  });

  it("rechaza direcciones demasiado cortas o largas", () => {
    expect(isValidStreetAddress("A 1")).toBe(false);
    expect(isValidStreetAddress(`${"Calle ".repeat(30)}123`)).toBe(false);
  });
});
