import { describe, expect, it } from "vitest";
import { urlParaIncrustar } from "./video-embed";

const ID = "VJbFltko_aU";
const ESPERADO = `https://www.youtube-nocookie.com/embed/${ID}?rel=0`;

describe("urlParaIncrustar", () => {
  it("acepta las formas de YouTube que una persona copia de la barra", () => {
    // Todas son respuestas correctas a "pega la URL del video", y ninguna
    // funciona dentro de un <iframe> tal cual.
    expect(urlParaIncrustar(`https://www.youtube.com/watch?v=${ID}`)).toBe(ESPERADO);
    expect(urlParaIncrustar(`https://youtu.be/${ID}`)).toBe(ESPERADO);
    expect(urlParaIncrustar(`https://www.youtube.com/embed/${ID}`)).toBe(ESPERADO);
    expect(urlParaIncrustar(`https://m.youtube.com/watch?v=${ID}`)).toBe(ESPERADO);
  });

  it("acepta un Short, que es justo lo que pegó el cliente", () => {
    expect(urlParaIncrustar(`https://youtube.com/shorts/${ID}?si=-OKkdNGTsIWIRags`)).toBe(ESPERADO);
  });

  it("tolera que falte el https://", () => {
    expect(urlParaIncrustar(`youtube.com/watch?v=${ID}`)).toBe(ESPERADO);
  });

  it("ignora los parámetros de seguimiento que vienen al compartir", () => {
    expect(urlParaIncrustar(`https://www.youtube.com/watch?v=${ID}&t=42&feature=share`)).toBe(
      ESPERADO,
    );
  });

  it("usa youtube-nocookie para no rastrear a quien no le dio play", () => {
    // Un video incrustado que deja cookies antes de que alguien lo mire es
    // dato personal que habría que declarar por tres videos del taller.
    expect(urlParaIncrustar(`https://youtu.be/${ID}`)).toContain("youtube-nocookie.com");
  });

  it("acepta Vimeo", () => {
    expect(urlParaIncrustar("https://vimeo.com/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
  });

  it("rechaza un dominio desconocido en vez de incrustarlo a ciegas", () => {
    // Meter en un <iframe> cualquier URL que alguien pegue es entregarle la
    // página a un tercero.
    expect(urlParaIncrustar("https://sitio-cualquiera.com/video.mp4")).toBeNull();
    expect(urlParaIncrustar("javascript:alert(1)")).toBeNull();
  });

  it("devuelve null con un id que no tiene forma de id", () => {
    expect(urlParaIncrustar("https://youtube.com/watch?v=corto")).toBeNull();
    expect(urlParaIncrustar("https://youtube.com/shorts/")).toBeNull();
  });

  it("un campo vacío no es un error, es un video sin configurar", () => {
    expect(urlParaIncrustar("")).toBeNull();
    expect(urlParaIncrustar("   ")).toBeNull();
  });
});
