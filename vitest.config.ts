import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Config de Vitest independiente de la de Astro.
 *
 * Se replica el alias "@" a mano (en vez de usar getViteConfig de Astro)
 * porque ese helper no expone el bloque `test` en sus tipos, y el proyecto
 * corre con TypeScript en modo estricto — preferimos un alias explícito
 * antes que silenciar el chequeo de tipos con un cast.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Solo .ts/.tsx: los .astro no los puede instrumentar el proveedor v8
      // (falla al parsear el frontmatter) y además se cubren vía E2E.
      include: ["src/lib/**/*.ts", "src/types/**/*.ts", "src/components/**/*.tsx"],
      exclude: ["src/test/**", "**/*.test.{ts,tsx}"],
      thresholds: {
        // Umbral bajo pero real: obliga a que la lógica de negocio esté
        // cubierta sin exigir tests de componentes puramente presentacionales.
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
