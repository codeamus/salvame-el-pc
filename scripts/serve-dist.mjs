/**
 * Servidor estático mínimo para `dist/`, usado por los tests E2E.
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

const DIST = resolve(process.cwd(), "dist");
const PORT = Number(process.argv[2] ?? 4321);

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

/** Resuelve una URL a un archivo dentro de dist/, evitando path traversal. */
async function resolveFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  // normalize + startsWith: sin esto, "/../../etc/passwd" saldría de dist/.
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

    const notFound = await readIfFile(join(DIST, "404.html"));
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(notFound ?? "404 Not Found");
  })();
});

server.listen(PORT, () => {
  console.log(`Sirviendo dist/ en http://localhost:${String(PORT)}`);
});
