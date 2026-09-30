/**
 * Base pública del sitio.
 *
 * La necesitan dos cosas muy distintas: las URLs de retorno que se le pasan
 * a TUU, y la revalidación del caché de Vercel. Vive acá y no en el módulo
 * de pagos porque dos implementaciones de esto se desincronizan, y cada una
 * falla de una forma difícil de ver.
 *
 * ⚠️ NUNCA se deriva del header Host de la petición entrante. Es tentador
 * —`new URL(request.url).origin` parece lo mismo— pero ese valor lo controla
 * quien llama: bastaría una petición con Host falsificado para que el
 * servidor mande el token de revalidación, o la URL del callback de pago, a
 * un dominio ajeno.
 */

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value !== undefined && value !== "" ? value : undefined;
}

/**
 * Lo que decide no es el orden de las variables sino el AMBIENTE.
 *
 *   - Producción → VERCEL_PROJECT_PRODUCTION_URL, el dominio real.
 *   - Preview    → VERCEL_BRANCH_URL, el alias estable de la rama. No cambia
 *     entre deploys, así que el callback registrado sigue vivo.
 *   - VERCEL_URL → única por deploy, con hash. Último recurso.
 *
 * Mirar VERCEL_ENV es obligatorio: Vercel define
 * VERCEL_PROJECT_PRODUCTION_URL en TODOS los deploys, preview incluidos. Una
 * cadena de `??` que la pusiera primero nunca llegaría a la rama, y cada
 * preview usaría las URLs de producción.
 */
export function resolveSiteUrl(): string {
  const explicit = readEnv("PUBLIC_SITE_URL");
  if (explicit !== undefined) return explicit.replace(/\/+$/, "");

  const fromVercel =
    readEnv("VERCEL_ENV") === "production"
      ? (readEnv("VERCEL_PROJECT_PRODUCTION_URL") ?? readEnv("VERCEL_URL"))
      : (readEnv("VERCEL_BRANCH_URL") ?? readEnv("VERCEL_URL"));

  if (fromVercel === undefined) {
    throw new Error(
      "Falta PUBLIC_SITE_URL y no se detectó un dominio de Vercel. " +
        "Define PUBLIC_SITE_URL con la base HTTPS del sitio, sin slash final.",
    );
  }

  return `https://${fromVercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
}
