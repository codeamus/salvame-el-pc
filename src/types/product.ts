/**
 * Tipos de dominio del catálogo.
 *
 * Se definen acá (y no en cada componente) para que exista UNA sola forma
 * de un producto en todo el proyecto. Cuando conectemos backend, estos tipos
 * son el contrato que la capa de datos tiene que cumplir — los componentes
 * no se enteran de si el dato vino de un mock o de una API.
 */

/**
 * Categoría del catálogo.
 *
 * Era una union cerrada (`"Mouse" | "Teclados" | …`) y ahora es un string,
 * porque las categorías se administran desde el panel y la lista solo se
 * conoce en runtime.
 *
 * Eso significa que el compilador YA NO atrapa un typo acá. La garantía no
 * desapareció, cambió de lugar: la da la clave foránea
 * products.category → categories.name, que se cumple venga la escritura de
 * donde venga. Es más fuerte que la anterior; solo llega más tarde.
 *
 * El alias se conserva —en vez de escribir `string` en cada sitio— para que
 * siga siendo evidente QUÉ representa ese string al leer una firma.
 */
export type Category = string;

/**
 * Precio en pesos chilenos, en unidades enteras (CLP no usa decimales).
 * Se tipa como branded type para que no se pueda pasar por accidente un
 * número que en realidad venía en otra moneda o en centavos.
 */
export type PriceCLP = number & { readonly __brand: "PriceCLP" };

export function priceCLP(value: number): PriceCLP {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`Precio CLP inválido: ${value}. Debe ser un entero >= 0.`);
  }
  return value as PriceCLP;
}

export interface Product {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly brand: string;
  readonly category: Category;
  readonly priceCLP: PriceCLP;
  /** Precio anterior, para mostrar descuento. Debe ser mayor que priceCLP. */
  readonly compareAtPriceCLP?: PriceCLP;
  /** Aparece en la sección "Destacados" de la portada. */
  readonly isFeatured: boolean;
  /**
   * Foto principal. Hoy son URLs de Unsplash (placeholders del handoff);
   * se reemplazarán por fotos reales del cliente sin tocar componentes.
   */
  readonly photo: string;
  /** Caption mono del placeholder rayado que se ve si la foto no carga. */
  readonly photoCaption: string;
  /** Specs como bullets de texto libre, en el orden en que se muestran. */
  readonly specs: readonly string[];
}

/** Porcentaje de descuento redondeado, o null si no hay precio de comparación. */
export function getDiscountPercent(product: Product): number | null {
  const { priceCLP: price, compareAtPriceCLP: compareAt } = product;
  if (compareAt === undefined || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

/** Nombre único de view transition de la foto: card → single. */
export function productViewTransitionName(product: Pick<Product, "id">): string {
  return `prod-${product.id}`;
}
