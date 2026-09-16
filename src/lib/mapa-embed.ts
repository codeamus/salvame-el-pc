/**
 * ─────────────────────────────────────────────────────────────────────────
 * ENLACE DE GOOGLE MAPS → MAPA QUE SE PUEDE INCRUSTAR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Misma historia que los videos, con un final peor.
 *
 * El campo del panel dice "Google Maps → Compartir → Insertar un mapa →
 * copiar el src del iframe", y aun así lo que llegó fue lo que da el botón
 * Compartir a secas:
 *
 *   https://maps.app.goo.gl/4deMggyxJJ57v1ec8
 *
 * Google responde a ese enlace con `x-frame-options: SAMEORIGIN`, así que
 * el navegador se niega a dibujarlo dentro de un <iframe>. La página no
 * mostraba un error: mostraba un recuadro vacío. Nadie tenía cómo saber
 * que el mapa estaba roto, ni por qué.
 *
 * Que el instructivo esté bien escrito y aun así no se siga no es un
 * descuido de quien administra el sitio: es la señal de que la pregunta
 * "pegá la URL del mapa" tiene más de una respuesta correcta y el código
 * tiene que aceptarlas todas. Las que llegan en la práctica son:
 *
 *   https://www.google.com/maps/embed?pb=!1m18!...   ← la que se pide
 *   https://maps.app.goo.gl/XXXXXXXX                 ← el botón Compartir
 *   https://www.google.com/maps/place/Local/@-33.4,-70.6,17z/data=!3d…
 *   https://www.google.com/maps?q=-33.472,-70.629
 *   Av. Providencia 1234, Providencia                ← la dirección, y ya
 *
 * Todas terminan en la única forma que Google deja incrustar sin API key
 * ni cuenta de facturación:
 *
 *   https://www.google.com/maps/embed?pb=!1m3!2m1!1s<consulta>!6i<zoom>
 *
 * (Verificado: esa URL responde 200 y sin `x-frame-options`. Es a donde
 * redirige internamente el viejo `?output=embed`, que además manda ese
 * encabezado en el 301 y por eso no se usa directo.)
 */

/** La forma incrustable. El `pb` es el formato posicional de Maps. */
const BASE_EMBED = "https://www.google.com/maps/embed?pb=";

/**
 * Zoom con el que se muestra el local.
 *
 * 16 es "la cuadra": se ven las calles con nombre y el número de la
 * puerta. El encuadre que trae el enlace compartido suele ser mucho más
 * abierto —el que pegó el cliente venía en 11z, media ciudad— porque es el
 * que tenía en pantalla cuando apretó Compartir, no el que sirve para
 * encontrar la tienda.
 */
const ZOOM_LOCAL = 16;

/** google.com, google.cl, maps.google.com.ar… */
const HOST_MAPS = /^(?:www\.|maps\.)?google\.[a-z]{2,}(?:\.[a-z]{2,})?$/;

/** Los acortadores: no se pueden traducir sin salir a la red. */
const HOSTS_CORTOS = new Set(["maps.app.goo.gl", "goo.gl"]);

function incrustar(consulta: string, zoom: number): string {
  return `${BASE_EMBED}!1m3!2m1!1s${encodeURIComponent(consulta)}!6i${String(zoom)}`;
}

/**
 * Lo parsea como URL solo si de verdad lo parece.
 *
 * Sin esta guarda, `new URL()` acepta "Maipú" como si fuera un host y una
 * dirección de una sola palabra terminaría descartada en vez de buscada.
 */
function comoUrl(valor: string): URL | null {
  if (!/^https?:\/\//i.test(valor)) return null;
  try {
    return new URL(valor);
  } catch {
    return null;
  }
}

/** ¿Es un enlace corto? Traducirlo necesita una petición: ver resolverMapa. */
export function esEnlaceCortoDeMapa(valor: string): boolean {
  const url = comoUrl(valor.trim());
  return url !== null && HOSTS_CORTOS.has(url.hostname.toLowerCase());
}

export function urlDeMapaParaIncrustar(valor: string): string | null {
  const limpio = valor.trim();
  if (limpio === "") return null;

  const url = comoUrl(limpio);

  // No es una URL: es la dirección escrita a mano, que es una forma
  // perfectamente razonable de responder "dónde queda la tienda".
  if (url === null) return incrustar(limpio, ZOOM_LOCAL);

  const host = url.hostname.toLowerCase();

  // El acortador se resuelve aparte, con red. Acá no hay nada que deducir.
  if (HOSTS_CORTOS.has(host)) return null;

  // Cualquier otro dominio se rechaza en vez de incrustarse a ciegas, por
  // lo mismo que con los videos: un <iframe> es entregarle un pedazo de la
  // página a un tercero.
  if (!HOST_MAPS.test(host)) return null;

  // Google sirve muchas cosas desde el mismo dominio. Sin esta condición,
  // una búsqueda cualquiera —/search?q=mapas— entraba por la rama del `q=`
  // y terminaba incrustada como si fuera una dirección.
  if (!url.pathname.startsWith("/maps") && !host.startsWith("maps.")) return null;

  // Ya viene en la forma correcta.
  if (url.pathname.startsWith("/maps/embed")) return url.toString();

  let enlace = url.href;
  try {
    enlace = decodeURIComponent(enlace);
  } catch {
    /* porcentajes mal formados: se busca sobre el original */
  }

  // Las coordenadas del LUGAR, que Maps guarda en el bloque `data=`. Se
  // prefieren sobre las del encuadre: el `@lat,lng` de la URL es dónde
  // estaba mirando la persona, y puede ser otro barrio.
  const lugar = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(enlace);
  if (lugar?.[1] !== undefined && lugar[2] !== undefined) {
    return incrustar(`${lugar[1]},${lugar[2]}`, ZOOM_LOCAL);
  }

  // El encuadre, con su propio zoom: si es lo único que hay, es lo que la
  // persona eligió mostrar.
  const encuadre = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)z/.exec(enlace);
  if (encuadre?.[1] !== undefined && encuadre[2] !== undefined && encuadre[3] !== undefined) {
    return incrustar(`${encuadre[1]},${encuadre[2]}`, Math.round(Number(encuadre[3])));
  }

  const consulta = url.searchParams.get("q") ?? url.searchParams.get("query");
  if (consulta !== null && consulta.trim() !== "") return incrustar(consulta, ZOOM_LOCAL);

  // .../maps/place/Salvame+El+PC+Spa/...
  const nombre = /\/maps\/place\/([^/@]+)/.exec(url.pathname);
  if (nombre?.[1] !== undefined) {
    let texto = nombre[1].replace(/\+/g, " ");
    try {
      texto = decodeURIComponent(texto);
    } catch {
      /* se usa tal cual */
    }
    if (texto.trim() !== "") return incrustar(texto, ZOOM_LOCAL);
  }

  return null;
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * RESOLVER EL ENLACE CORTO
 * ─────────────────────────────────────────────────────────────────────────
 *
 * maps.app.goo.gl no dice nada por sí solo: hay que preguntarle a Google a
 * dónde apunta. Es una petición de red en medio de un render, así que:
 *
 *   · Se lee SOLO el redirect (`redirect: "manual"`), sin descargar la
 *     página de Maps entera.
 *   · Con tope de tiempo. Una página de contacto que tarda diez segundos
 *     porque Google no contesta es peor que una sin mapa.
 *   · Se cachea en memoria, acierto y error. La URL del local cambia una
 *     vez cada nunca, y la página se sirve desde el caché de Vercel: esto
 *     corre al regenerar, no en cada visita.
 */
const CACHE_CORTOS = new Map<string, string | null>();
const TOPE_MS = 2500;

export async function resolverUrlDeMapa(valor: string): Promise<string | null> {
  const limpio = valor.trim();

  const directo = urlDeMapaParaIncrustar(limpio);
  if (directo !== null) return directo;
  if (!esEnlaceCortoDeMapa(limpio)) return null;

  const cacheado = CACHE_CORTOS.get(limpio);
  if (cacheado !== undefined) return cacheado;

  let resultado: string | null = null;
  try {
    const respuesta = await fetch(limpio, {
      redirect: "manual",
      signal: AbortSignal.timeout(TOPE_MS),
    });
    const destino = respuesta.headers.get("location");
    if (destino !== null) resultado = urlDeMapaParaIncrustar(destino);
  } catch {
    // Sin red, con timeout o con Google caído: la página muestra el enlace
    // "Ver en Google Maps" y sigue andando.
    resultado = null;
  }

  CACHE_CORTOS.set(limpio, resultado);
  return resultado;
}
