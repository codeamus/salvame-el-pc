import { defineConfig, devices } from "@playwright/test";

/**
 * Puerto propio de los E2E, deliberadamente lejos del 4321 de `astro dev`.
 *
 * Astro arranca en 4321 y va subiendo (4322, 4323…) si está ocupado. Si los
 * tests compartieran ese rango y alguien tuviera el dev server levantado,
 * Playwright se conectaría al dev server en vez de al build — que es
 * exactamente lo que esta configuración quiere evitar.
 */
const PORT = 4390;
const BASE_URL = `http://localhost:${PORT}`;

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  /*
   * Fase "próximamente": las specs del sitio completo esperan en e2e/_wip/
   * porque sus rutas no se publican (ver src/pages/index.astro). Se ignoran
   * en vez de borrarse — al reactivar las páginas se mueven de vuelta y esta
   * línea se elimina.
   */
  testIgnore: "**/_wip/**",
  fullyParallel: true,
  // En CI, fallar si quedó un test.only olvidado en el código.
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // En CI un solo worker para que los tiempos sean estables; en local,
  // la mitad de los cores disponibles.
  workers: isCI ? 1 : "50%",
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "es-CL",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 13"] } },
  ],

  // Se testea contra el build real, no contra el dev server: lo que se
  // verifica es exactamente lo que se despliega.
  //
  // Se usa un server propio (scripts/serve-dist.mjs) y no `astro preview`
  // porque este último se levanta como daemon: el proceso en primer plano
  // termina apenas arranca, y Playwright lo interpreta como que el webServer
  // murió. Ver el comentario en ese archivo.
  webServer: {
    command: `pnpm build && node scripts/serve-dist.mjs ${String(PORT)}`,
    url: BASE_URL,
    // Nunca se reutiliza un server ajeno, ni en local. Reutilizarlo hacía que
    // la suite corriera contra lo que hubiera escuchando en el puerto: con un
    // `astro dev` levantado, los tests pasaban a medir el dev server —los
    // islands ni siquiera hidrataban— y los fallos no tenían relación con el
    // código. Levantar el server propio cuesta un build y elimina la clase
    // entera de falso negativo.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
