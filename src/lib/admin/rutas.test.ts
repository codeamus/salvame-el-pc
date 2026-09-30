import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RUTAS_DE_CONTENIDO, RUTAS_EXENTAS } from "./rutas";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * QUE NINGUNA PÁGINA SE QUEDE FUERA
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Este archivo existe por un bug que no se veía.
 *
 * `servicio-tecnico.astro` era la única página sin `prerender = false`, así
 * que se horneaba en el build: un HTML fijo con lo que hubiera en Supabase
 * el día del deploy. Se editaba el hero desde el panel, se guardaba bien, se
 * publicaba y el panel respondía que todo salió bien — y la página seguía
 * igual, porque no había función que volver a ejecutar. No fallaba nada:
 * fallaba que no pasara nada, que es la clase de bug que sobrevive meses.
 *
 * Y el endpoint de publicar decía en su comentario que revalidaba "el sitio
 * entero" mientras su lista tenía tres rutas. Contacto y los dos documentos
 * legales se publicaban sin efecto visible hasta que expiraba el caché.
 *
 * Los dos son el mismo error: una página nueva entra al sitio y nadie se
 * acuerda de sumarla. Por eso esto no se comprueba mirando, se comprueba
 * leyendo el directorio.
 */

/* Desde la raíz del proyecto, que es donde vitest corre. `import.meta.url`
 * no sirve acá: el transform de vite no lo deja como URL de archivo. */
const PAGES = resolve(process.cwd(), "src/pages");

/** Todos los .astro de src/pages, con su ruta pública. */
function paginas(dir = PAGES): { archivo: string; ruta: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const completo = join(dir, entrada.name);
    if (entrada.isDirectory()) return paginas(completo);
    if (!entrada.name.endsWith(".astro")) return [];

    const relativo = relative(PAGES, completo).replaceAll("\\", "/");
    const ruta = `/${relativo.replace(/\.astro$/, "").replace(/\/?index$/, "")}`;
    return [{ archivo: `src/pages/${relativo}`, ruta: ruta === "" ? "/" : ruta }];
  });
}

/** Las que el panel puede editar: quedan fuera el panel mismo. */
function paginasDeContenido() {
  return paginas().filter(({ ruta }) => !ruta.startsWith("/admin"));
}

describe("las páginas del sitio", () => {
  it("se renderizan a pedido, para que lo que se edita se vea", () => {
    const horneadas = paginasDeContenido()
      .filter(
        ({ archivo }) => !readFileSync(archivo, "utf8").includes("export const prerender = false"),
      )
      .map(({ archivo }) => archivo);

    // Una página estática congela el contenido en el momento del deploy: el
    // panel guarda, publica, dice que sí, y no cambia nada hasta el próximo
    // push. Desde afuera se ve igual que un panel roto.
    expect(horneadas).toEqual([]);
  });

  it("están todas en la lista que se rehace al publicar", () => {
    const cubiertas = new Set([...RUTAS_DE_CONTENIDO, ...Object.keys(RUTAS_EXENTAS)]);

    const olvidadas = paginasDeContenido()
      .map(({ ruta }) => ruta)
      .filter((ruta) => !cubiertas.has(ruta));

    // Si esto falla, alguien agregó una página y no la sumó a
    // RUTAS_DE_CONTENIDO: se va a publicar sin efecto visible hasta que
    // expire el caché, y quien administre el sitio va a pensar que el botón
    // no sirve.
    expect(olvidadas).toEqual([]);
  });

  it("no revalida rutas que ya no existen", () => {
    const reales = new Set(paginasDeContenido().map(({ ruta }) => ruta));

    // Al revés también molesta: una ruta borrada sigue pidiéndose en cada
    // publicación, responde 404 y el panel reporta una página fallida para
    // siempre. Eso entrena a ignorar el aviso.
    expect(RUTAS_DE_CONTENIDO.filter((ruta) => !reales.has(ruta))).toEqual([]);
  });
});
