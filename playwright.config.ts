import { defineConfig, devices } from "@playwright/test";

const PORT = 4321;
const BASE_URL = `http://localhost:${PORT}`;

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
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
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
