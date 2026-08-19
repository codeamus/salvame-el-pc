import {
  isTheme,
  oppositeTheme,
  parseDurationMs,
  resolveTheme,
  THEME_COLOR,
  THEME_STORAGE_KEY,
  THEME_SWITCH_DURATION_PROPERTY,
  THEME_SWITCHING_CLASS,
  themeToggleLabel,
  type Theme,
} from "@/lib/theme";

/**
 * Pegamento del modo oscuro con el documento.
 *
 * El primer pintado NO pasa por acá: lo resuelve el script en línea del
 * <head> de BaseLayout, que corre antes de que el navegador dibuje nada. Sin
 * eso habría un flash blanco en cada carga para quien usa modo oscuro, que
 * es exactamente el problema que este módulo no puede resolver por llegar
 * tarde. Acá queda lo que sí puede esperar: el clic del botón, la etiqueta
 * accesible y mantener el atributo vivo entre navegaciones.
 *
 * Igual que cart-ui.ts, corre UNA vez por visita y todo va por delegación en
 * `document`: con <ClientRouter /> el body se reemplaza entero y un listener
 * pegado al botón se perdería en la primera navegación.
 */

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Lee la elección guardada. `null` = seguir al sistema. */
function readStored(): Theme | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : null;
  } catch {
    // Safari en navegación privada y algunos bloqueadores tiran acá. Sin
    // persistencia el sitio sigue funcionando: se sigue al sistema.
    return null;
  }
}

function writeStored(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* Ver readStored: sin localStorage la elección dura lo que la página. */
  }
}

function currentTheme(): Theme {
  return resolveTheme(readStored(), darkQuery.matches);
}

/**
 * Escribe el tema en el documento.
 *
 * El atributo se pone SOLO cuando hay elección explícita: sin él, la media
 * query de tokens.css sigue al sistema sola. Así el modo oscuro funciona
 * aunque este script nunca corra, y quien no eligió nada acompaña los
 * cambios del sistema operativo en vivo.
 */
function applyTheme(stored: Theme | null): void {
  const root = document.documentElement;

  if (stored === null) delete root.dataset.theme;
  else root.dataset.theme = stored;

  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", THEME_COLOR[resolveTheme(stored, darkQuery.matches)]);
}

/** Sincroniza la etiqueta del botón con lo que hará al pulsarlo. */
function renderToggles(): void {
  const label = themeToggleLabel(currentTheme());
  for (const el of document.querySelectorAll("[data-theme-toggle]")) {
    el.setAttribute("aria-label", label);
    el.setAttribute("title", label);
  }
}

/**
 * Cambia el tema con el fundido de colores.
 *
 * Los tres pasos del medio no son adorno:
 *
 *   1. Se pone la clase que habilita las transiciones.
 *   2. Se fuerza un reflow leyendo offsetWidth. Sin esto el navegador puede
 *      juntar el "ahora hay transición" y el "ahora el color es otro" en el
 *      mismo recálculo de estilos, y en ese caso no hay nada que animar: el
 *      color salta igual que antes. Leer una propiedad de layout obliga a
 *      cerrar el primer recálculo antes de tocar el color.
 *   3. Recién ahí se cambia el tema.
 *
 * La clase se saca al terminar y no en `transitionend`: ese evento lo
 * disparan cientos de nodos y el que llega último no es predecible.
 */
let switchTimer: number | undefined;

function switchTheme(next: Theme): void {
  const root = document.documentElement;
  const duration = reducedMotionQuery.matches
    ? 0
    : parseDurationMs(getComputedStyle(root).getPropertyValue(THEME_SWITCH_DURATION_PROPERTY));

  writeStored(next);

  if (duration === 0) {
    applyTheme(next);
    renderToggles();
    return;
  }

  window.clearTimeout(switchTimer);
  root.classList.add(THEME_SWITCHING_CLASS);
  void root.offsetWidth;

  applyTheme(next);
  renderToggles();

  switchTimer = window.setTimeout(() => {
    root.classList.remove(THEME_SWITCHING_CLASS);
  }, duration);
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest("[data-theme-toggle]")) return;

  switchTheme(oppositeTheme(currentTheme()));
});

/*
 * El ClientRouter reemplaza los atributos de <html> por los del documento
 * nuevo, y ese documento es HTML estático: no trae data-theme. Sin esto, la
 * primera navegación devuelve el sitio al tema del sistema y la elección del
 * visitante se pierde a mitad de camino.
 */
document.addEventListener("astro:after-swap", () => {
  applyTheme(readStored());
});

document.addEventListener("astro:page-load", renderToggles);

/* Quien no eligió nada acompaña al sistema en vivo: si cambia mientras el
 * sitio está abierto, solo hay que refrescar la etiqueta y la meta — de los
 * colores se encarga la media query. */
darkQuery.addEventListener("change", () => {
  if (readStored() === null) {
    applyTheme(null);
    renderToggles();
  }
});

renderToggles();
