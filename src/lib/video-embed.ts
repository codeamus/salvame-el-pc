/**
 * ─────────────────────────────────────────────────────────────────────────
 * URL DE VIDEO → URL PARA INCRUSTAR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * El panel pide "la URL del video" y quien la pega copia lo que tiene en la
 * barra del navegador. Eso puede ser cualquiera de estas, y todas son
 * respuestas correctas a la pregunta:
 *
 *   https://www.youtube.com/watch?v=ID
 *   https://youtu.be/ID
 *   https://youtube.com/shorts/ID          ← la que pegó el cliente
 *   https://www.youtube.com/embed/ID
 *   https://vimeo.com/123456789
 *
 * Ninguna funciona dentro de un <iframe> salvo la de /embed/. Pedirle a
 * quien administra el sitio que convierta la URL a mano sería trasladarle un
 * detalle técnico que no tiene por qué conocer — y la primera vez que se
 * equivoque, el video no se ve y no hay forma de saber por qué.
 */

/** Los ids de YouTube son 11 caracteres de un alfabeto acotado. */
const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;

/** Lo que hace falta para pintar un video: dónde vive y con qué id. */
export interface DatosDeVideo {
  readonly proveedor: "youtube" | "vimeo";
  readonly id: string;
  /** El src del <iframe>. */
  readonly embed: string;
}

/** Solo el src del reproductor, para quien no necesita el resto. */
export function urlParaIncrustar(url: string): string | null {
  return datosDeVideo(url)?.embed ?? null;
}

export function datosDeVideo(url: string): DatosDeVideo | null {
  const limpia = url.trim();
  if (limpia === "") return null;

  let parsed: URL;
  try {
    // Sin esquema, `new URL` lanza. Se asume https antes de rendirse: pegar
    // "youtube.com/watch?v=…" sin el https es de lo más común.
    parsed = new URL(limpia.startsWith("http") ? limpia : `https://${limpia}`);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "");

  // ── YouTube ────────────────────────────────────────────────────────────
  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1);
    return ID_YOUTUBE.test(id) ? youtube(id) : null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const enWatch = parsed.searchParams.get("v");
    if (enWatch !== null && ID_YOUTUBE.test(enWatch)) return youtube(enWatch);

    // /shorts/ID, /embed/ID y /v/ID comparten forma.
    const segmentos = parsed.pathname.split("/").filter((x) => x !== "");
    if (segmentos.length === 2 && ["shorts", "embed", "v", "live"].includes(segmentos[0] ?? "")) {
      const id = segmentos[1] ?? "";
      return ID_YOUTUBE.test(id) ? youtube(id) : null;
    }
    return null;
  }

  // ── Vimeo ──────────────────────────────────────────────────────────────
  if (host === "vimeo.com") {
    const id = parsed.pathname.split("/").find((x) => x !== "") ?? "";
    if (!/^\d+$/.test(id)) return null;
    return { proveedor: "vimeo", id, embed: `https://player.vimeo.com/video/${id}` };
  }

  if (host === "player.vimeo.com") {
    const id = parsed.pathname.split("/").at(-1) ?? "";
    return { proveedor: "vimeo", id, embed: parsed.toString() };
  }

  // Un dominio desconocido se rechaza en vez de meterse en un <iframe> a
  // ciegas: incrustar cualquier URL que alguien pegue es entregarle la
  // página a un tercero.
  return null;
}

/**
 * youtube-nocookie.com y no youtube.com.
 *
 * Es el dominio "modo privacidad mejorada" de YouTube: no deja cookies de
 * seguimiento hasta que la persona le da play. Un video incrustado en la
 * portada que rastrea a cada visitante antes de que lo mire es exactamente
 * el tipo de dato que la Ley 19.628 obliga a declarar, y no vale la pena
 * declararlo por tres videos del taller.
 */
function youtube(id: string): DatosDeVideo {
  return {
    proveedor: "youtube",
    id,
    embed: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
  };
}
