import { getSupabaseReader, memoizarBreve } from "@/lib/supabase/reader";
import { priceCLP, type Category, type Product } from "@/types/product";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * CAPA DE DATOS — catálogo desde Supabase
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Todo el front consume el catálogo a través de estas funciones, NUNCA
 * importando datos directamente. Esa disciplina es justo lo que permitió
 * cambiar de productos.json a la base sin tocar un solo componente: las
 * firmas ya devolvían Promise porque estaban escritas para este día.
 *
 * Se lee con la clave PÚBLICA, así que el RLS decide qué se ve. Que un
 * producto despublicado no aparezca no depende de que alguien se acuerde de
 * filtrar `is_published` en cada consulta: la base no lo devuelve. Eso es lo
 * que hace que un borrador siga siendo un borrador aunque alguien adivine su
 * slug.
 */

/** Fila de `products` tal como la devuelve PostgREST. */
interface FilaProducto {
  id: number;
  slug: string;
  name: string;
  brand: string;
  category: string;
  price_clp: number;
  compare_at_price_clp: number | null;
  is_featured: boolean;
  photo_url: string;
  photo_caption: string | null;
  specs: string[];
  stock: number;
  track_stock: boolean;
  sort_order: number;
}

const COLUMNAS =
  "id, slug, name, brand, category, price_clp, compare_at_price_clp, is_featured, photo_url, photo_caption, specs, stock, track_stock, sort_order";

function aProducto(fila: FilaProducto): Product {
  return {
    id: fila.id,
    slug: fila.slug,
    name: fila.name,
    brand: fila.brand,
    category: fila.category,
    priceCLP: priceCLP(fila.price_clp),
    // Spread condicional por exactOptionalPropertyTypes: la propiedad no
    // debe existir (ni como undefined) cuando no hay precio anterior.
    ...(fila.compare_at_price_clp === null
      ? {}
      : { compareAtPriceCLP: priceCLP(fila.compare_at_price_clp) }),
    isFeatured: fila.is_featured,
    photo: fila.photo_url,
    // El caption se genera si nadie escribió uno: null en la base significa
    // "usa el de por defecto", no "déjalo en blanco".
    photoCaption: fila.photo_caption ?? `[ foto: ${fila.name.toLowerCase()} ]`,
    specs: fila.specs,
  };
}

/**
 * El catálogo completo, en una sola consulta por render.
 *
 * La portada necesita todos los productos, los destacados y las ofertas; el
 * catálogo los necesita todos y además las marcas. Pedirlos por separado
 * serían cuatro viajes a la base para mostrar una página. Se traen una vez y
 * las demás funciones filtran en memoria.
 *
 * Con doce productos esto es trivialmente correcto, y sigue siéndolo con
 * varios cientos. Si el catálogo llegara a miles, lo que cambia es el cuerpo
 * de estas funciones — no quien las llama.
 */
const cargarCatalogo = memoizarBreve(async (): Promise<readonly Product[]> => {
  const { data, error } = await getSupabaseReader()
    .from("products")
    .select(COLUMNAS)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .returns<FilaProducto[]>();

  if (error !== null) {
    // Se lanza en vez de devolver vacío: una tienda sin productos por un
    // fallo de red se vería igual que una tienda vacía de verdad, y el
    // deploy pasaría sin que nadie se entere.
    throw new Error(`[catálogo] no se pudo leer el catálogo: ${error.message}`);
  }

  return data.map(aProducto);
});

/** Devuelve el catálogo completo. */
export function getAllProducts(): Promise<readonly Product[]> {
  return cargarCatalogo();
}

/** Productos marcados como destacados, para la portada (máx. 4). */
export async function getFeaturedProducts(): Promise<readonly Product[]> {
  const catalogo = await cargarCatalogo();
  return catalogo.filter((product) => product.isFeatured).slice(0, 4);
}

/** Productos con precio anterior — "Ofertas de la semana" (máx. 3). */
export async function getOfferProducts(): Promise<readonly Product[]> {
  const catalogo = await cargarCatalogo();
  return catalogo.filter((product) => product.compareAtPriceCLP !== undefined).slice(0, 3);
}

/** Busca por slug. Devuelve null si no existe (no lanza). */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const catalogo = await cargarCatalogo();
  return catalogo.find((product) => product.slug === slug) ?? null;
}

/**
 * Busca por id. Devuelve null si no existe (no lanza).
 *
 * Es la que usa /api/checkout para recalcular el precio en el servidor: el
 * carrito viaja por la red con ids y cantidades, nunca con montos. Que el
 * precio salga de acá y no del navegador es lo que impide que alguien pague
 * $1 por una GPU.
 */
export async function getProductById(id: number): Promise<Product | null> {
  const catalogo = await cargarCatalogo();
  return catalogo.find((product) => product.id === id) ?? null;
}

/** Productos de la misma categoría, excluyendo al propio (para "Relacionados"). */
export async function getRelatedProducts(product: Product, limit = 3): Promise<readonly Product[]> {
  const catalogo = await cargarCatalogo();
  return catalogo
    .filter((otro) => otro.category === product.category && otro.id !== product.id)
    .slice(0, limit);
}

/** Lista de marcas únicas, ordenada alfabéticamente. Para filtros. */
export async function getBrands(): Promise<readonly string[]> {
  const catalogo = await cargarCatalogo();
  return [...new Set(catalogo.map((product) => product.brand))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
}

/** Cantidad de productos por categoría — chips "02 productos" del bento. */
export async function countByCategory(category: Category): Promise<number> {
  const catalogo = await cargarCatalogo();
  return catalogo.filter((product) => product.category === category).length;
}

/** Foto de la galería de un producto. */
export interface FotoProducto {
  readonly url: string;
  readonly alt: string;
}

/**
 * Galería completa de un producto: la principal más las adicionales.
 *
 * Es una función aparte y no un campo de `Product` a propósito. El catálogo,
 * la portada y el buscador muestran UNA foto por producto; traer la galería
 * en esa consulta sería pedir decenas de filas que nadie va a mirar, en la
 * página que más tiene que pesar poco.
 *
 * Devuelve siempre al menos la principal, así la ficha no necesita un caso
 * especial para el producto que todavía no tiene fotos extra —que hoy son
 * todos—.
 */
export async function getProductGallery(product: Product): Promise<readonly FotoProducto[]> {
  const { data, error } = await getSupabaseReader()
    .from("product_images")
    .select("url, alt")
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true })
    .returns<{ url: string; alt: string }[]>();

  const principal: FotoProducto = { url: product.photo, alt: product.name };

  // Un fallo acá no puede dejar la ficha sin foto: la principal ya la
  // tenemos, y una galería incompleta es mejor que un producto sin imagen.
  if (error !== null) {
    console.error(`[catálogo] no se pudo leer la galería de ${product.slug}: ${error.message}`);
    return [principal];
  }

  return [
    principal,
    ...data
      .filter((fila) => fila.url.trim() !== "" && fila.url !== product.photo)
      .map((fila) => ({ url: fila.url, alt: fila.alt })),
  ];
}
