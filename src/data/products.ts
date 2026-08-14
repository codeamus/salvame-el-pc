import rawProducts from "@/data/productos.json";
import { isCategory, priceCLP, type Category, type Product } from "@/types/product";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * CAPA DE DATOS — catálogo desde productos.json (entregado en el handoff).
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Todo el front consume el catálogo a través de las funciones de este módulo,
 * NUNCA importando el array directamente. Eso hace que el día que conectemos
 * backend solo haya que reescribir el cuerpo de estas funciones (y hacerlas
 * async de verdad) sin tocar un solo componente.
 *
 * Las firmas ya devuelven Promise justamente por eso: los componentes ya
 * están escritos como si el dato viniera de la red.
 */

interface RawProduct {
  readonly id: number;
  readonly slug: string;
  readonly nombre: string;
  readonly marca: string;
  readonly cat: string;
  readonly precio: number;
  readonly antes?: number;
  readonly destacado?: boolean;
  readonly foto: string;
  readonly specs: readonly string[];
}

function toProduct(raw: RawProduct): Product {
  if (!isCategory(raw.cat)) {
    throw new Error(`Producto ${raw.slug}: categoría desconocida "${raw.cat}"`);
  }
  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.nombre,
    brand: raw.marca,
    category: raw.cat,
    priceCLP: priceCLP(raw.precio),
    // Spread condicional por exactOptionalPropertyTypes: la propiedad no
    // debe existir (ni siquiera como undefined) cuando no hay precio anterior.
    ...(raw.antes === undefined ? {} : { compareAtPriceCLP: priceCLP(raw.antes) }),
    isFeatured: raw.destacado ?? false,
    photo: raw.foto,
    photoCaption: `[ foto: ${raw.nombre.toLowerCase()} ]`,
    specs: raw.specs,
  };
}

const CATALOG: readonly Product[] = (rawProducts as readonly RawProduct[]).map(toProduct);

/** Devuelve el catálogo completo. */
export function getAllProducts(): Promise<readonly Product[]> {
  return Promise.resolve(CATALOG);
}

/** Productos marcados como destacados, para la portada (máx. 4). */
export function getFeaturedProducts(): Promise<readonly Product[]> {
  return Promise.resolve(CATALOG.filter((product) => product.isFeatured).slice(0, 4));
}

/** Productos con precio anterior — "Ofertas de la semana" (máx. 3). */
export function getOfferProducts(): Promise<readonly Product[]> {
  return Promise.resolve(
    CATALOG.filter((product) => product.compareAtPriceCLP !== undefined).slice(0, 3),
  );
}

/** Busca por slug. Devuelve null si no existe (no lanza). */
export function getProductBySlug(slug: string): Promise<Product | null> {
  return Promise.resolve(CATALOG.find((product) => product.slug === slug) ?? null);
}

/** Productos de la misma categoría, excluyendo al propio (para "Relacionados"). */
export function getRelatedProducts(product: Product, limit = 3): Promise<readonly Product[]> {
  return Promise.resolve(
    CATALOG.filter((p) => p.category === product.category && p.id !== product.id).slice(0, limit),
  );
}

/** Lista de marcas únicas, ordenada alfabéticamente. Para filtros. */
export function getBrands(): Promise<readonly string[]> {
  const brands = [...new Set(CATALOG.map((product) => product.brand))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
  return Promise.resolve(brands);
}

/** Cantidad de productos por categoría — chips "02 productos" del bento. */
export function countByCategory(category: Category): Promise<number> {
  return Promise.resolve(CATALOG.filter((product) => product.category === category).length);
}
