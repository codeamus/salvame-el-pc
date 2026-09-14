import { getSupabaseReader, memoizarBreve } from "@/lib/supabase/reader";
import type { Category } from "@/types/product";

/**
 * Categorías del catálogo, desde Supabase.
 *
 * Reemplaza a la constante `CATEGORIES` de src/types/product.ts. Se lee con
 * la clave pública, así que el RLS ya deja fuera las ocultas: una categoría
 * marcada como no visible desaparece de la portada y de los filtros sin que
 * ninguna página tenga que acordarse de filtrarla.
 */
const cargar = memoizarBreve(async (): Promise<readonly Category[]> => {
  const { data, error } = await getSupabaseReader()
    .from("categories")
    .select("name")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .returns<{ name: string }[]>();

  if (error !== null) {
    throw new Error(`[categorías] no se pudieron leer: ${error.message}`);
  }

  return data.map((fila) => fila.name);
});

export function getCategories(): Promise<readonly Category[]> {
  return cargar();
}
