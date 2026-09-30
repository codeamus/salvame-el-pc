/**
 * Servidor del build, usado por los tests E2E.
 *
 * Sirve `.vercel/output/static` y, para lo que no encuentre ahí, ejecuta la
 * función SSR que el adapter dejó en `.vercel/output/functions`.
 *
 * Ese fallback dejó de ser opcional cuando el sitio pasó a leer su contenido
 * de Supabase: la portada, la tienda y las fichas de producto ya no son
 * archivos en disco. Sin esto, la suite ni siquiera arranca — Playwright
 * espera indefinidamente un 200 en "/" que nunca llega.
 *
 * ¿Por qué no `astro preview`? Porque en Astro 7 se levanta como daemon: el
 * proceso en primer plano arranca el server y termina de inmediato. Playwright
 * interpreta eso como "el webServer murió al arrancar" y aborta la corrida.
 *
 * Este server corre en primer plano, no tiene dependencias externas y —lo
 * importante para los tests— devuelve el `404.html` con status HTTP 404 real,
 * cosa que la mayoría de los servers estáticos simples no hace.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const DIST = resolve(process.cwd(), ".vercel", "output", "static");
const PORT = Number(process.argv[2] ?? 4321);

/*
 * El handler SSR que produce el adapter de Vercel.
 *
 * La ruta es larga porque el adapter duplica la estructura dentro de la
 * carpeta de la función; sale de `handler` en su .vc-config.json.
 */
const SSR_ENTRY = resolve(
  process.cwd(),
  ".vercel/output/functions/_render.func/.vercel/output/server/entry.mjs",
);

/**
 * Se carga una sola vez y bajo demanda.
 *
 * Importarlo al arrancar haría que el server no levantara cuando el build
 * todavía no existe, y el fallo se vería como "el webServer murió" en vez de
 * como "falta compilar".
 */
let ssr = null;

async function handlerSSR() {
  ssr ??= await import(SSR_ENTRY).then((m) => m.default);
  return ssr;
}

/**
 * Adapta el handler del adapter a la API de node:http.
 *
 * El entry exporta `{ fetch }` —un handler web estándar de Request a
 * Response—, no la firma (req, res) de Node: en Vercel es el runtime quien
 * hace esta traducción. Acá hay que hacerla a mano.
 */
async function responderConSSR(req, res, url) {
  const { fetch: manejar } = await handlerSSR();

  // GET y HEAD no tienen cuerpo; el resto se acumula porque pasar un stream
  // a Request obliga a `duplex: "half"` y no aporta nada en una suite E2E.
  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const trozos = [];
    for await (const trozo of req) trozos.push(trozo);
    body = Buffer.concat(trozos);
  }

  const peticion = new Request(url, {
    method: req.method,
    headers: req.headers,
    ...(body === undefined ? {} : { body }),
  });

  const respuesta = await manejar(peticion);

  res.writeHead(respuesta.status, Object.fromEntries(respuesta.headers));
  if (respuesta.body === null) {
    res.end();
    return;
  }
  res.end(Buffer.from(await respuesta.arrayBuffer()));
}

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
]);

function contentTypeFor(filePath) {
  return CONTENT_TYPES.get(extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

async function readIfFile(filePath) {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) return null;
    return await readFile(filePath);
  } catch {
    return null;
  }
}

/** Resuelve una URL a un archivo dentro del build, evitando path traversal. */
async function resolveFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  // normalize + startsWith: sin esto, "/../../etc/passwd" saldría del build.
  const candidate = resolve(join(DIST, normalize(decoded)));
  if (candidate !== DIST && !candidate.startsWith(DIST + "/")) return null;

  const direct = await readIfFile(candidate);
  if (direct) return { body: direct, path: candidate };

  const asIndex = join(candidate, "index.html");
  const index = await readIfFile(asIndex);
  if (index) return { body: index, path: asIndex };

  return null;
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? "/", `http://localhost:${String(PORT)}`);
    const file = await resolveFile(url.pathname);

    if (file) {
      res.writeHead(200, { "Content-Type": contentTypeFor(file.path) });
      res.end(file.body);
      return;
    }

    /*
     * No está en disco: lo renderiza la función.
     *
     * Es el mismo entry.mjs que corre en Vercel, así que los tests siguen
     * midiendo lo que se despliega y no una aproximación. Incluye las rutas
     * de /api/**, que antes había que interceptar con page.route().
     */
    try {
      await responderConSSR(req, res, url);
      return;
    } catch (error) {
      // Un fallo del SSR se reporta como 500 con el detalle: en una suite
      // E2E, un 404 silencioso manda a buscar el problema al lugar
      // equivocado durante un buen rato.
      console.error("[serve-dist] el SSR falló en", url.pathname, error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`SSR falló: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
  })();
});

server.listen(PORT, () => {
  console.log(`Sirviendo .vercel/output/static en http://localhost:${String(PORT)}`);
});
