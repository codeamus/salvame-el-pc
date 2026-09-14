import { getSupabaseReader, memoizarBreve } from "@/lib/supabase/reader";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * CAPA DE DATOS — textos y ajustes desde Supabase
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Reemplaza a las constantes SITE, CONTACT, LEGAL y PROMO_TEXT que vivían
 * en src/config/site.ts, borrado en este cambio.
 *
 * Todo se lee con la clave pública, así que una página despublicada o una
 * sección oculta simplemente no vuelven: ninguna plantilla tiene que
 * acordarse de filtrarlas.
 */

export type Ajustes = Readonly<Record<string, unknown>>;

const cargarAjustes = memoizarBreve(async (): Promise<Ajustes> => {
  const { data, error } = await getSupabaseReader()
    .from("site_settings")
    .select("key, value")
    .returns<{ key: string; value: unknown }[]>();

  if (error !== null) {
    throw new Error(`[ajustes] no se pudieron leer: ${error.message}`);
  }

  return Object.fromEntries(data.map((fila) => [fila.key, fila.value]));
});

export function getSettings(): Promise<Ajustes> {
  return cargarAjustes();
}

/**
 * Lee un ajuste de texto.
 *
 * El valor por defecto no es pereza: si alguien borra una fila de
 * site_settings, la alternativa es que el sitio entero deje de renderizar
 * por un título que falta. Es preferible que salga un texto de reserva y
 * que el resto siga en pie.
 */
export function texto(ajustes: Ajustes, clave: string, porDefecto = ""): string {
  const valor = ajustes[clave];
  return typeof valor === "string" ? valor : porDefecto;
}

export function numero(ajustes: Ajustes, clave: string, porDefecto: number): number {
  const valor = ajustes[clave];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : porDefecto;
}

export function lista(ajustes: Ajustes, clave: string): readonly string[] {
  const valor = ajustes[clave];
  return Array.isArray(valor) ? valor.filter((x): x is string => typeof x === "string") : [];
}

export interface Enlace {
  readonly href: string;
  readonly label: string;
}

export function enlaces(ajustes: Ajustes, clave: string): readonly Enlace[] {
  const valor = ajustes[clave];
  if (!Array.isArray(valor)) return [];

  return valor.flatMap((item): Enlace[] => {
    if (typeof item !== "object" || item === null) return [];
    const enlace = item as Record<string, unknown>;
    if (typeof enlace.href !== "string" || typeof enlace.label !== "string") return [];
    return [{ href: enlace.href, label: enlace.label }];
  });
}

/**
 * ¿Sigue siendo un placeholder del handoff?
 *
 * Los corchetes son un seguro deliberado: la Ley 19.496 obliga a informar
 * quién vende, y un documento legal publicado con "[ rut pendiente ]" tiene
 * que verse a la legua. resolverPlaceholders() los pinta en coral.
 */
export function esPendiente(valor: string): boolean {
  return valor.trimStart().startsWith("[");
}

// ── Secciones de página ──────────────────────────────────────────────────

export type Seccion = Readonly<Record<string, unknown>>;

/**
 * Todas las secciones visibles de una página, por su clave.
 *
 * Una sola consulta por página en vez de una por sección: la portada tiene
 * seis bloques y pedirlos uno a uno serían seis viajes para pintar una
 * pantalla.
 */
const cacheSecciones = new Map<string, () => Promise<Record<string, Seccion>>>();

export function getSections(slugPagina: string): Promise<Record<string, Seccion>> {
  let cargar = cacheSecciones.get(slugPagina);

  if (cargar === undefined) {
    cargar = memoizarBreve(async () => {
      const { data, error } = await getSupabaseReader()
        .from("page_sections")
        .select("key, content, pages!inner(slug)")
        .eq("pages.slug", slugPagina)
        .order("sort_order", { ascending: true })
        .returns<{ key: string; content: Seccion }[]>();

      if (error !== null) {
        throw new Error(`[contenido] no se pudo leer la página "${slugPagina}": ${error.message}`);
      }

      return Object.fromEntries(data.map((fila) => [fila.key, fila.content]));
    });

    cacheSecciones.set(slugPagina, cargar);
  }

  return cargar();
}

/**
 * Un campo de una sección, con reserva.
 *
 * Igual que en `texto`: que alguien vacíe un campo desde el panel no puede
 * dejar la página en blanco.
 */
export function campo(secciones: Record<string, Seccion>, ruta: string, porDefecto = ""): string {
  const [clave, propiedad] = ruta.split(".");
  if (clave === undefined || propiedad === undefined) return porDefecto;

  const valor = secciones[clave]?.[propiedad];
  return typeof valor === "string" && valor !== "" ? valor : porDefecto;
}

/** Una lista de objetos dentro de una sección (servicios, videos, enlaces). */
export function items(
  secciones: Record<string, Seccion>,
  ruta: string,
): readonly Record<string, string>[] {
  const [clave, propiedad] = ruta.split(".");
  if (clave === undefined || propiedad === undefined) return [];

  const valor = secciones[clave]?.[propiedad];
  if (!Array.isArray(valor)) return [];

  return valor.flatMap((item): Record<string, string>[] => {
    if (typeof item !== "object" || item === null) return [];
    const salida: Record<string, string> = {};
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      // Solo se aceptan strings y números. Un objeto anidado se descarta en
      // vez de convertirse: String({}) da "[object Object]", que se
      // renderizaría tal cual en la página sin que nada falle.
      if (typeof v === "string") salida[k] = v;
      else if (typeof v === "number" || typeof v === "boolean") salida[k] = String(v);
    }
    return [salida];
  });
}

/** Una lista de strings dentro de una sección. */
export function listaDeSeccion(
  secciones: Record<string, Seccion>,
  ruta: string,
): readonly string[] {
  const [clave, propiedad] = ruta.split(".");
  if (clave === undefined || propiedad === undefined) return [];

  const valor = secciones[clave]?.[propiedad];
  return Array.isArray(valor) ? valor.filter((x): x is string => typeof x === "string") : [];
}

// ── Documentos legales ───────────────────────────────────────────────────

export interface SeccionLegal {
  readonly anchor: string;
  readonly title: string;
  readonly bodyHtml: string;
}

export interface DocumentoLegal {
  readonly slug: string;
  readonly title: string;
  readonly intro: string;
  readonly seoDescription: string;
  readonly actualizado: string;
  readonly secciones: readonly SeccionLegal[];
}

interface FilaDocumento {
  slug: string;
  title: string;
  intro: string;
  seo_description: string | null;
  content_updated_on: string;
  legal_sections: { anchor: string; title: string; body_html: string; sort_order: number }[];
}

const cacheLegales = new Map<string, () => Promise<DocumentoLegal | null>>();

export function getLegalDocument(slug: string): Promise<DocumentoLegal | null> {
  let cargar = cacheLegales.get(slug);

  if (cargar === undefined) {
    cargar = memoizarBreve(async () => {
      const { data, error } = await getSupabaseReader()
        .from("legal_documents")
        .select(
          "slug, title, intro, seo_description, content_updated_on, legal_sections(anchor, title, body_html, sort_order)",
        )
        .eq("slug", slug)
        .maybeSingle<FilaDocumento>();

      if (error !== null) {
        throw new Error(`[legales] no se pudo leer "${slug}": ${error.message}`);
      }
      if (data === null) return null;

      return {
        slug: data.slug,
        title: data.title,
        intro: data.intro,
        seoDescription: data.seo_description ?? "",
        actualizado: data.content_updated_on,
        secciones: [...data.legal_sections]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => ({ anchor: s.anchor, title: s.title, bodyHtml: s.body_html })),
      };
    });

    cacheLegales.set(slug, cargar);
  }

  return cargar();
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Reemplaza los {{placeholders}} de un documento legal por sus ajustes.
 *
 * Tres cosas que hace y por qué:
 *
 *   · Los montos se formatean con el mismo formatCLP que usa el carrito. Si
 *     la letra chica dijera "3990" y el checkout "$3.990" seguiría siendo el
 *     mismo número, pero si alguien cambia el costo de envío en Ajustes, este
 *     texto cambia con él. Que el documento contradiga al checkout es el tipo
 *     de incumplimiento que sanciona el SERNAC.
 *   · Un valor que sigue siendo placeholder del handoff se envuelve en la
 *     marca coral. La razón social y el RUT son obligatorios: un
 *     "[ rut pendiente ]" suelto en medio de un párrafo se lee como contenido
 *     real y se publica sin que nadie lo note.
 *   · Una clave inexistente se deja tal cual, visible. Borrarla en silencio
 *     dejaría una frase sin sujeto que nadie detectaría al revisar.
 */
export function resolverPlaceholders(
  html: string,
  ajustes: Ajustes,
  formatearMonto: (valor: number) => string,
): string {
  return html.replace(/\{\{([a-z0-9_.]+)\}\}/gi, (original, clave: string) => {
    const valor = ajustes[clave];

    if (typeof valor === "number") return escaparHtml(formatearMonto(valor));
    if (typeof valor !== "string") return original;

    const escapado = escaparHtml(valor);
    return esPendiente(valor)
      ? `<span class="legal-pendiente" data-legal-pendiente>${escapado}</span>`
      : escapado;
  });
}
