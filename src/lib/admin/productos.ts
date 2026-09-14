/**
 * ─────────────────────────────────────────────────────────────────────────
 * REGLAS DEL FORMULARIO DE PRODUCTOS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Vive fuera de los componentes para poder probarlo sin montar React, que es
 * donde estas reglas se rompen sin que nadie se entere.
 *
 * La validación de acá NO es la que protege la base: esa son los CHECK de
 * supabase/schema.sql, que se cumplen venga la escritura de donde venga.
 * Esta existe para que el admin vea un mensaje en español al lado del campo
 * equivocado en vez de un "violates check constraint
 * products_compare_at_gt_price" después de perder lo que escribió.
 */

/** Fila de `products` tal como viaja entre el panel y PostgREST. */
export interface ProductoAdmin {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly brand: string;
  readonly category: string;
  readonly price_clp: number;
  readonly compare_at_price_clp: number | null;
  readonly is_featured: boolean;
  readonly photo_url: string;
  readonly photo_path: string | null;
  readonly photo_caption: string | null;
  readonly specs: readonly string[];
  readonly stock: number;
  readonly track_stock: boolean;
  readonly is_published: boolean;
  readonly sort_order: number;
}

/** Lo que el formulario mantiene mientras se edita: todo texto. */
export interface FormularioProducto {
  slug: string;
  name: string;
  brand: string;
  category: string;
  price_clp: string;
  compare_at_price_clp: string;
  specs: string;
  stock: string;
  photo_url: string;
  photo_path: string | null;
  photo_caption: string;
  is_featured: boolean;
  track_stock: boolean;
  is_published: boolean;
  sort_order: string;
}

/** Campos que se escriben en la base. Es el subconjunto editable de la fila. */
export type ValoresProducto = Omit<ProductoAdmin, "id">;

export type ErroresProducto = Partial<Record<keyof FormularioProducto, string>>;

export const FORMULARIO_VACIO: FormularioProducto = {
  slug: "",
  name: "",
  brand: "",
  category: "",
  price_clp: "",
  compare_at_price_clp: "",
  specs: "",
  stock: "0",
  photo_url: "",
  photo_path: null,
  photo_caption: "",
  is_featured: false,
  track_stock: true,
  is_published: true,
  sort_order: "0",
};

/**
 * Texto → slug.
 *
 * Se normaliza a NFD y se quitan los diacríticos para que "Audífonos" dé
 * "audifonos" y no "audfonos": sin el paso de normalización, la tilde es un
 * carácter que el filtro de [a-z0-9] se lleva junto con la vocal.
 */
export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Lee un monto en pesos escrito por una persona.
 *
 * Acepta "19.990", "19990" y "$ 19.990" porque en Chile los miles se separan
 * con punto y el admin va a escribirlo como lo ve en pantalla. Devuelve null
 * si no queda un entero válido — nunca un NaN silencioso, que terminaría
 * guardado como precio.
 */
export function parseCLP(texto: string): number | null {
  const limpio = texto.replace(/[$\s.]/g, "").replace(",", ".");
  if (limpio === "") return null;

  const valor = Number(limpio);
  if (!Number.isInteger(valor) || valor < 0) return null;
  return valor;
}

/** Fila de la base → estado del formulario. */
export function aFormulario(producto: ProductoAdmin): FormularioProducto {
  return {
    slug: producto.slug,
    name: producto.name,
    brand: producto.brand,
    category: producto.category,
    price_clp: String(producto.price_clp),
    compare_at_price_clp:
      producto.compare_at_price_clp === null ? "" : String(producto.compare_at_price_clp),
    // Una spec por línea: es la forma más simple de editar una lista corta
    // sin inventar una interfaz de arrastrar y soltar que nadie pidió.
    specs: producto.specs.join("\n"),
    stock: String(producto.stock),
    photo_url: producto.photo_url,
    photo_path: producto.photo_path,
    photo_caption: producto.photo_caption ?? "",
    is_featured: producto.is_featured,
    track_stock: producto.track_stock,
    is_published: producto.is_published,
    sort_order: String(producto.sort_order),
  };
}

export type ResultadoValidacion =
  | { readonly ok: true; readonly valores: ValoresProducto }
  | { readonly ok: false; readonly errores: ErroresProducto };

/**
 * @param categoriasValidas Las que existen hoy en la base. Se pasa en vez de
 * importarse porque las categorías dejaron de ser una constante: ahora se
 * administran, y esta función no tiene forma de conocerlas por su cuenta.
 */
export function validarProducto(
  form: FormularioProducto,
  categoriasValidas: readonly string[],
): ResultadoValidacion {
  const errores: ErroresProducto = {};

  const name = form.name.trim();
  if (name === "") errores.name = "El nombre es obligatorio.";

  const brand = form.brand.trim();
  if (brand === "") errores.brand = "La marca es obligatoria.";

  // Si no escribieron slug, se deriva del nombre. Es lo que espera cualquiera
  // que solo quiere cargar un producto y no piensa en URLs.
  const slug = form.slug.trim() === "" ? slugify(name) : slugify(form.slug);
  if (slug === "") errores.slug = "No se pudo generar una URL a partir del nombre.";

  // Se comprueba contra la lista viva y no contra una union de TypeScript.
  // La comprobación de verdad la hace la clave foránea de la base; esta
  // existe para avisar en el formulario en vez de al guardar.
  const category = form.category.trim();
  if (category === "") {
    errores.category = "Elige una categoría.";
  } else if (!categoriasValidas.includes(category)) {
    errores.category = `La categoría "${category}" ya no existe. Elige otra.`;
  }

  const price = parseCLP(form.price_clp);
  if (price === null) errores.price_clp = "Escribe un precio válido en pesos.";

  let compareAt: number | null = null;
  if (form.compare_at_price_clp.trim() !== "") {
    compareAt = parseCLP(form.compare_at_price_clp);
    if (compareAt === null) {
      errores.compare_at_price_clp = "Escribe un precio válido o déjalo vacío.";
    } else if (price !== null && compareAt <= price) {
      // Mismo criterio que getDiscountPercent y que el CHECK de la base: un
      // "antes" menor o igual al actual no es un descuento, es un dato roto
      // que se vería como un producto sin oferta.
      errores.compare_at_price_clp = "El precio anterior tiene que ser MAYOR que el actual.";
    }
  }

  const stock = Number(form.stock.trim() === "" ? "0" : form.stock.trim());
  if (!Number.isInteger(stock) || stock < 0) {
    errores.stock = "El stock tiene que ser un número entero de 0 o más.";
  }

  const sortOrder = Number(form.sort_order.trim() === "" ? "0" : form.sort_order.trim());
  if (!Number.isInteger(sortOrder)) errores.sort_order = "El orden tiene que ser un número entero.";

  const specs = form.specs
    .split("\n")
    .map((linea) => linea.trim())
    .filter((linea) => linea !== "");

  // price y category entran a la condición además de `errores` para que el
  // compilador los estreche: si alguno fuera null ya habría un error anotado,
  // pero TypeScript no puede deducirlo del tamaño de un objeto.
  if (Object.keys(errores).length > 0 || price === null) {
    return { ok: false, errores };
  }

  return {
    ok: true,
    valores: {
      slug,
      name,
      brand,
      category,
      price_clp: price,
      compare_at_price_clp: compareAt,
      is_featured: form.is_featured,
      photo_url: form.photo_url.trim(),
      photo_path: form.photo_path,
      // Vacío se guarda como null y no como "": así el front puede caerse a
      // su texto por defecto ("[ foto: nombre ]") en vez de pintar un caption
      // en blanco.
      photo_caption: form.photo_caption.trim() === "" ? null : form.photo_caption.trim(),
      specs,
      stock,
      track_stock: form.track_stock,
      is_published: form.is_published,
      sort_order: sortOrder,
    },
  };
}

/**
 * Traduce el error de Postgres a algo que el admin pueda accionar.
 *
 * Los CHECK y los índices únicos del schema son la última línea de defensa y
 * van a saltar alguna vez —dos pestañas abiertas, un slug repetido—, pero sus
 * mensajes vienen en inglés y nombran constraints. Sin traducirlos, el panel
 * muestra jerga de base de datos justo en el momento de guardar.
 */
export function mensajeDeErrorSupabase(mensaje: string): string {
  if (/products_slug_key|duplicate key/i.test(mensaje)) {
    return "Ya existe un producto con esa URL. Cámbiala o usa otro nombre.";
  }
  if (/products_compare_at_gt_price/i.test(mensaje)) {
    return "El precio anterior tiene que ser mayor que el actual.";
  }
  if (/products_category_fkey|products_category_check/i.test(mensaje)) {
    return "Esa categoría no existe. Puede que la hayan renombrado o borrado desde otra pestaña.";
  }
  if (/products_stock_check|stock/i.test(mensaje) && /check/i.test(mensaje)) {
    return "El stock no puede ser negativo.";
  }
  if (/row-level security|permission denied|jwt/i.test(mensaje)) {
    return "Tu sesión no tiene permiso para esto. Vuelve a entrar.";
  }
  return mensaje;
}
