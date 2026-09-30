import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * CATEGORÍAS — capa de datos del panel
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Dejaron de ser la union cerrada `CATEGORIES` de src/types/product.ts para
 * ser filas de una tabla. Lo que se perdió con eso, dicho sin rodeos: el
 * compilador ya no puede atrapar un typo en una categoría, porque la lista
 * solo se conoce en runtime.
 *
 * La garantía no desapareció, cambió de lugar. Ahora la da la clave foránea
 * products.category → categories.name, que se cumple venga la escritura de
 * donde venga — incluido un curl con la service role key. Es una garantía
 * más fuerte que la anterior; solo llega más tarde.
 */

export interface CategoriaAdmin {
  readonly name: string;
  readonly sort_order: number;
  readonly is_visible: boolean;
}

/** Categoría + cuántos productos tiene. Lo segundo decide si se puede borrar. */
export interface CategoriaConUso extends CategoriaAdmin {
  readonly productos: number;
}

export const COLUMNAS_CATEGORIA = "name, sort_order, is_visible";

/**
 * Nombre válido para una categoría.
 *
 * El nombre es la clave primaria Y lo que viaja en la URL del catálogo
 * (/tienda?cat=Mouse), así que un espacio de sobra no es un detalle
 * cosmético: rompe el filtro, que compara texto exacto. La base tiene el
 * mismo CHECK; esto es para avisar antes y no después.
 */
export function validarNombreCategoria(
  nombre: string,
  existentes: readonly string[],
  original?: string,
): string | null {
  const limpio = nombre.trim();

  if (limpio === "") return "El nombre es obligatorio.";
  if (limpio.length > 40) return "Máximo 40 caracteres.";

  const repetida = existentes.some(
    (otra) => otra.toLowerCase() === limpio.toLowerCase() && otra !== original,
  );
  if (repetida) return "Ya existe una categoría con ese nombre.";

  return null;
}

/**
 * Traduce los errores propios de esta tabla.
 *
 * El de la foránea es el que más va a aparecer y el que peor se lee en
 * crudo: dice "violates foreign key constraint products_category_fkey" y lo
 * que el admin necesita saber es que primero tiene que mover los productos.
 */
export function mensajeDeErrorCategoria(mensaje: string): string {
  if (/products_category_fkey/i.test(mensaje)) {
    return "Esa categoría tiene productos. Muévelos a otra categoría antes de borrarla.";
  }
  if (/categories_pkey|duplicate key/i.test(mensaje)) {
    return "Ya existe una categoría con ese nombre.";
  }
  if (/categories_name_no_vacio/i.test(mensaje)) {
    return "El nombre no puede estar vacío.";
  }
  if (/row-level security|permission denied/i.test(mensaje)) {
    return "Tu sesión no tiene permiso para esto. Vuelve a entrar.";
  }
  return mensaje;
}

/**
 * Categorías con su cantidad de productos.
 *
 * Dos consultas y el cruce en memoria, en vez de un `count` agregado por
 * PostgREST: son unas pocas decenas de filas, y así el panel ve TAMBIÉN las
 * categorías ocultas y las que no tienen ningún producto — que son
 * justamente las que uno quiere revisar.
 */
export async function cargarCategoriasConUso(
  supabase: SupabaseClient,
): Promise<{ datos: CategoriaConUso[] } | { error: string }> {
  const [categorias, productos] = await Promise.all([
    supabase
      .from("categories")
      .select(COLUMNAS_CATEGORIA)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .returns<CategoriaAdmin[]>(),
    supabase.from("products").select("category").returns<{ category: string }[]>(),
  ]);

  if (categorias.error !== null)
    return { error: mensajeDeErrorCategoria(categorias.error.message) };
  if (productos.error !== null) return { error: mensajeDeErrorCategoria(productos.error.message) };

  const conteo = new Map<string, number>();
  for (const fila of productos.data) {
    conteo.set(fila.category, (conteo.get(fila.category) ?? 0) + 1);
  }

  return {
    datos: categorias.data.map((categoria) => ({
      ...categoria,
      productos: conteo.get(categoria.name) ?? 0,
    })),
  };
}
