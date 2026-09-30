import { describe, expect, it } from "vitest";
import { parseMensajeContacto } from "./contact-form";

function cuerpo(cambios: Record<string, unknown> = {}) {
  return {
    nombre: "Ana Pérez",
    correo: "ana@ejemplo.cl",
    asunto: "Consulta por producto",
    mensaje: "¿Tienen stock del mouse Redragon?",
    ...cambios,
  };
}

describe("parseMensajeContacto", () => {
  it("acepta un mensaje normal y lo normaliza", () => {
    const r = parseMensajeContacto(cuerpo({ nombre: "  Ana Pérez  ", correo: "ANA@Ejemplo.CL " }));

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mensaje.nombre).toBe("Ana Pérez");
    // El correo se normaliza a minúsculas: es la casilla a la que se
    // responde, y "ANA@" y "ana@" son la misma persona.
    expect(r.mensaje.correo).toBe("ana@ejemplo.cl");
  });

  it("exige nombre, correo y mensaje", () => {
    expect(parseMensajeContacto(cuerpo({ nombre: "   " })).ok).toBe(false);
    expect(parseMensajeContacto(cuerpo({ correo: "" })).ok).toBe(false);
    expect(parseMensajeContacto(cuerpo({ mensaje: "  " })).ok).toBe(false);
  });

  it("rechaza un correo con el que después no se podría responder", () => {
    expect(parseMensajeContacto(cuerpo({ correo: "ana" })).ok).toBe(false);
    expect(parseMensajeContacto(cuerpo({ correo: "ana@ejemplo" })).ok).toBe(false);
    expect(parseMensajeContacto(cuerpo({ correo: "ana @ejemplo.cl" })).ok).toBe(false);
  });

  it("el asunto es opcional y se recorta", () => {
    const sinAsunto = parseMensajeContacto(cuerpo({ asunto: undefined }));
    expect(sinAsunto.ok && sinAsunto.mensaje.asunto).toBe("");

    const largo = parseMensajeContacto(cuerpo({ asunto: "x".repeat(300) }));
    expect(largo.ok && largo.mensaje.asunto.length).toBe(120);
  });

  it("rechaza un mensaje descomunal en vez de guardarlo", () => {
    const r = parseMensajeContacto(cuerpo({ mensaje: "x".repeat(5000) }));
    expect(r.ok).toBe(false);
  });

  it("descarta al bot que llena el campo trampa, fingiendo que funcionó", () => {
    // Devolver un error le enseñaría al bot que lo detectaron y que conviene
    // reintentar de otra forma. Un "gracias" lo deja creyendo que ya está.
    const r = parseMensajeContacto(cuerpo({ sitio_web: "https://spam.example" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.descartar).toBe(true);
  });

  it("una persona deja el campo trampa vacío y pasa igual", () => {
    // El navegador manda el input escondido como "": eso NO es un bot.
    expect(parseMensajeContacto(cuerpo({ sitio_web: "" })).ok).toBe(true);
  });

  it("no revienta con basura", () => {
    expect(parseMensajeContacto(null).ok).toBe(false);
    expect(parseMensajeContacto("texto").ok).toBe(false);
    expect(parseMensajeContacto({ nombre: 42 }).ok).toBe(false);
  });
});
