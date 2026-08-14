import type { PriceCLP } from "@/types/product";

const CLP_FORMATTER = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/**
 * Formatea un precio en pesos chilenos: 45990 → "$45.990".
 *
 * Se centraliza acá (y no se hace `.toLocaleString()` suelto en cada
 * componente) para que el formato sea idéntico en toda la app y para poder
 * testearlo en un solo lugar.
 */
export function formatCLP(value: PriceCLP | number): string {
  return CLP_FORMATTER.format(value);
}

const NUMBER_FORMATTER = new Intl.NumberFormat("es-CL");

export function formatNumber(value: number): string {
  return NUMBER_FORMATTER.format(value);
}
