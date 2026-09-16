import { describe, expect, it } from "vitest";
import { esEnlaceCortoDeMapa, urlDeMapaParaIncrustar } from "./mapa-embed";

/** La consulta que quedó dentro del `pb`, ya decodificada. */
function consultaDe(embed: string | null): string | null {
  const encontrado = /!1s([^!]+)/.exec(embed ?? "");
  return encontrado?.[1] === undefined ? null : decodeURIComponent(encontrado[1]);
}

function zoomDe(embed: string | null): string | null {
  return /!6i(\d+)/.exec(embed ?? "")?.[1] ?? null;
}

describe("urlDeMapaParaIncrustar", () => {
  it("deja pasar la URL de embed que pide el instructivo", () => {
    const embed = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3330.1";
    expect(urlDeMapaParaIncrustar(embed)).toBe(embed);
  });

  it("saca las coordenadas del LUGAR, no las del encuadre", () => {
    // La URL real que dejó el enlace compartido del cliente: el encuadre
    // está en -70.79 (11z, media ciudad) y el local en -70.62.
    const compartido =
      "https://www.google.com/maps/place/Salvame+El+PC+Spa/@-33.4726789,-70.7946383,11z/data=!3m1!4b1!4m6!3m5!1s0xdd6fe7246632993:0xab10b1303cd616e9!8m2!3d-33.472788!4d-70.6298313";

    expect(consultaDe(urlDeMapaParaIncrustar(compartido))).toBe("-33.472788,-70.6298313");
    expect(zoomDe(urlDeMapaParaIncrustar(compartido))).toBe("16");
  });

  it("usa el encuadre cuando es lo único que trae, con su propio zoom", () => {
    const url = "https://www.google.com/maps/@-33.4372,-70.6506,17z";
    expect(consultaDe(urlDeMapaParaIncrustar(url))).toBe("-33.4372,-70.6506");
    expect(zoomDe(urlDeMapaParaIncrustar(url))).toBe("17");
  });

  it("entiende ?q= con coordenadas", () => {
    const url = "https://maps.google.com/maps?q=-33.472788,-70.6298313";
    expect(consultaDe(urlDeMapaParaIncrustar(url))).toBe("-33.472788,-70.6298313");
  });

  it("cae en el nombre del lugar si no hay coordenadas", () => {
    const url = "https://www.google.com/maps/place/Salvame+El+PC+Spa";
    expect(consultaDe(urlDeMapaParaIncrustar(url))).toBe("Salvame El PC Spa");
  });

  it("acepta google.cl igual que google.com", () => {
    expect(urlDeMapaParaIncrustar("https://www.google.cl/maps?q=Providencia")).not.toBeNull();
  });

  it("toma la dirección escrita a mano como una búsqueda", () => {
    const embed = urlDeMapaParaIncrustar("Av. Providencia 1234, Providencia, Santiago");
    expect(consultaDe(embed)).toBe("Av. Providencia 1234, Providencia, Santiago");
    expect(zoomDe(embed)).toBe("16");
  });

  it("no incrusta el enlace corto: hay que resolverlo por red", () => {
    const corto = "https://maps.app.goo.gl/4deMggyxJJ57v1ec8";
    expect(urlDeMapaParaIncrustar(corto)).toBeNull();
    expect(esEnlaceCortoDeMapa(corto)).toBe(true);
  });

  it("rechaza un dominio que no es Google Maps", () => {
    // Incrustar cualquier cosa que alguien pegue es entregarle la página.
    expect(urlDeMapaParaIncrustar("https://evil.example/mapa")).toBeNull();
    expect(urlDeMapaParaIncrustar("https://www.openstreetmap.org/#map=17/-33.4/-70.6")).toBeNull();
  });

  it("no rompe con el campo vacío", () => {
    expect(urlDeMapaParaIncrustar("")).toBeNull();
    expect(urlDeMapaParaIncrustar("   ")).toBeNull();
    expect(esEnlaceCortoDeMapa("")).toBe(false);
  });

  it("una URL de Google que no es un mapa no devuelve nada", () => {
    expect(urlDeMapaParaIncrustar("https://www.google.com/search?q=mapas")).toBeNull();
  });
});
