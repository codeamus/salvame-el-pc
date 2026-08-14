import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina clases condicionales (clsx) y resuelve conflictos de Tailwind
 * (tailwind-merge), donde la última gana.
 *
 * Esto es lo que permite que un componente tenga clases por defecto y que
 * quien lo usa las pueda sobreescribir sin pelear con la especificidad:
 *
 *   cn("px-4 py-2", "px-6")  →  "py-2 px-6"   (no "px-4 px-6")
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
