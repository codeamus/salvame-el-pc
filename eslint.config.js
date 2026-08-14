import js from "@eslint/js";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".astro/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      // Código de backend parkeado: no forma parte del build ni del lint.
      "docs/backend-reference/**",
    ],
  },

  js.configs.recommended,

  // Reglas de tipos: requieren type information del tsconfig.
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Seguridad de tipos: prohibir `any` explícito y silencios sin explicar.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description" },
      ],

      // Consistencia: preferir `type` para imports de tipos, así el bundler
      // los elimina sin ambigüedad.
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // Variables sin usar: se permiten si empiezan con _ (convención para
      // "sé que no lo uso, es a propósito").
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // Promesas: atrapar awaits olvidados, que son una fuente clásica de bugs.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // Preferencias de estilo que ayudan a la legibilidad.
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "object-shorthand": "error",
    },
  },

  // Componentes React: accesibilidad.
  {
    files: ["**/*.{jsx,tsx}"],
    ...jsxA11y.flatConfigs.recommended,
  },

  // Archivos .astro.
  ...astro.configs.recommended,
  ...astro.configs["jsx-a11y-recommended"],
  {
    files: ["**/*.astro"],
    languageOptions: {
      parserOptions: {
        // astro-eslint-parser no soporta projectService; se le pasa el
        // tsconfig de forma explícita para que igual haya type info.
        projectService: false,
        project: "./tsconfig.json",
      },
    },
    rules: {
      // El frontmatter de .astro corre en build time y el parser no resuelve
      // los tipos igual que en un .ts puro; estas reglas dan falsos positivos.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
    },
  },

  // Configuración y scripts de build: JS de infraestructura, sin tipos
  // publicados por varios plugins y con salida por consola legítima.
  // No tiene sentido exigirles la misma type-safety que al código de la app.
  {
    files: ["*.config.{js,ts,mjs}", "eslint.config.js", "scripts/**/*.{js,mjs}"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "no-console": "off",
    },
  },

  // Tests: se permite algo más de laxitud.
  {
    files: ["**/*.test.{ts,tsx}", "e2e/**/*.ts", "src/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": "off",
    },
  },

  // Debe ir último: apaga las reglas de formato que colisionan con Prettier.
  prettier,
);
