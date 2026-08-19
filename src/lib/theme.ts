/**
 * Modo claro / oscuro: decisiones puras, sin tocar el DOM.
 *
 * Está separado de theme-ui.ts (que sí manipula el documento) para poder
 * testear la parte que tiene reglas —qué gana entre lo guardado y lo que
 * pide el sistema operativo— sin montar un navegador.
 *
 * El modelo tiene TRES estados posibles, no dos:
 *
 *   - sin elección guardada → se sigue al sistema operativo, y eso lo
 *     resuelve el CSS solo con una media query (ver tokens.css). Es el
 *     estado inicial de toda visita nueva.
 *   - "light" / "dark" guardados → el visitante eligió a mano y su elección
 *     manda por sobre el sistema.
 *
 * Que el default sea "seguir al sistema" y no "claro" es lo que hace que
 * alguien con el computador en oscuro entre y ya lo vea oscuro, sin flash y
 * sin haber tocado nada.
 */

export const THEME_STORAGE_KEY = "salvameelpc:theme";

export type Theme = "light" | "dark";

/** Color de la barra del navegador (meta theme-color) en cada modo. */
export const THEME_COLOR: Record<Theme, string> = {
  light: "#F6F1E7",
  dark: "#15120F",
};

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/**
 * Qué tema se ve realmente, combinando lo guardado con lo que pide el
 * sistema. Lo guardado gana siempre: es una elección explícita.
 */
export function resolveTheme(stored: unknown, systemPrefersDark: boolean): Theme {
  if (isTheme(stored)) return stored;
  return systemPrefersDark ? "dark" : "light";
}

export function oppositeTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

/**
 * Etiqueta del botón. Nombra el destino y no el estado actual ("cambiar a
 * modo oscuro", no "modo claro activo"): un botón se anuncia por lo que
 * hace al pulsarlo.
 */
export function themeToggleLabel(current: Theme): string {
  return current === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
}

/** Clase que activa el fundido de colores mientras dura el cambio. */
export const THEME_SWITCHING_CLASS = "theme-switching";

/** Custom property donde vive la duración de ese fundido. */
export const THEME_SWITCH_DURATION_PROPERTY = "--theme-switch-duration";

/**
 * Convierte una duración de CSS ("260ms", "0.26s") a milisegundos.
 *
 * Existe porque la duración se declara en tokens.css y no en JavaScript: es
 * un valor de diseño y vive con el resto de la paleta. Acá solo se lee, así
 * que hay que entender las dos unidades que CSS admite —y devolver 0 ante
 * cualquier cosa rara, que en la práctica significa "cambia sin fundido" en
 * vez de "se queda pegado esperando".
 */
export function parseDurationMs(raw: string): number {
  const value = raw.trim();
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;

  return value.endsWith("ms") ? amount : amount * 1000;
}
