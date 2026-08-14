/**
 * Tipos de dominio del catálogo.
 *
 * Se definen acá (y no en cada componente) para que exista UNA sola forma
 * de un producto en todo el proyecto. Cuando conectemos backend, estos tipos
 * son el contrato que la capa de datos tiene que cumplir — los componentes
 * no se enteran de si el dato vino de un mock o de una API.
 */

/** Categorías del catálogo. Union cerrada: el compilador atrapa typos. */
export const CATEGORIES = ["Mouse", "Teclados", "RAM", "Audífonos", "Monitores", "GPU"] as const;
export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

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
