import { atom } from "nanostores";

/**
 * Toast global "Agregado: {producto} · ver carrito" del handoff.
 *
 * Es un store (y no estado local de un componente) porque lo disparan
 * lugares distintos — el botón "+" de una card estática, el island de la
 * ficha de producto — y lo renderiza un único elemento fijo en el layout.
 */

export const TOAST_DURATION_MS = 2600;

export const $toast = atom<string>("");

let hideTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string): void {
  $toast.set(message);
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    $toast.set("");
  }, TOAST_DURATION_MS);
}
