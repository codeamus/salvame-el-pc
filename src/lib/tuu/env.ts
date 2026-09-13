import type { TuuEnvName } from "./types";

/**
 * Configuración de TUU leída del entorno.
 *
 * No hay un solo `if` de ambiente en el resto del código: en Vercel se
 * definen los MISMOS nombres de variable con valores distintos por
 * environment (Production / Preview / Development), así que el deploy de
 * producción trae credenciales de producción y cualquier rama trae las de QA.
 */

const ENDPOINTS: Record<TuuEnvName, string> = {
  qa: "https://frontend-api.payment.haulmer.dev/v1/payment",
  prod: "https://core.payment.haulmer.com/api/v1/payment",
};

export interface TuuConfig {
  readonly env: TuuEnvName;
  readonly endpoint: string;
  readonly accountId: string;
  readonly secretKey: string;
  readonly shopName: string;
  /** Base pública del sitio, ya sin slash final. */
  readonly siteUrl: string;
}

/**
 * Variables leídas de `import.meta.env` con acceso ESTÁTICO, una por una.
 *
 * No es verbosidad: Vite reemplaza `import.meta.env.LO_QUE_SEA` en tiempo de
 * build, buscando esa expresión literal en el código. Un acceso dinámico
 * —`import.meta.env[nombre]`— no se reemplaza nunca, así que devuelve
 * `undefined` para toda variable sin prefijo PUBLIC_ y el endpoint falla con
 * un "falta la variable de entorno" imposible de diagnosticar, aunque el
 * .env esté perfecto.
 *
 * Agregar una variable nueva significa agregar su línea acá.
 */
const STATIC_ENV: Readonly<Record<string, string | undefined>> = {
  TUU_ENV: import.meta.env.TUU_ENV,
  TUU_ACCOUNT_ID: import.meta.env.TUU_ACCOUNT_ID,
  TUU_SECRET_KEY: import.meta.env.TUU_SECRET_KEY,
  TUU_SHOP_NAME: import.meta.env.TUU_SHOP_NAME,
  PUBLIC_SITE_URL: import.meta.env.PUBLIC_SITE_URL,
};

/**
 * Lee una variable de entorno.
 *
 * `process.env` va primero: es lo que existe en runtime dentro de una función
 * serverless de Vercel, y es de donde salen las variables que Vercel inyecta
 * sola (VERCEL_BRANCH_URL y compañía). `import.meta.env` es el fallback para
 * `astro dev`, donde las variables se cargan desde el .env local.
 */
function readEnv(name: string): string | undefined {
  const fromProcess = typeof process === "undefined" ? undefined : process.env[name];
  if (fromProcess !== undefined && fromProcess !== "") return fromProcess;

  const fromMeta = STATIC_ENV[name];
  return fromMeta !== undefined && fromMeta !== "" ? fromMeta : undefined;
}

function required(name: string): string {
  const value = readEnv(name);
  if (value === undefined) {
    throw new Error(
      `[tuu] Falta la variable de entorno ${name}. ` +
        `Revisa .env en local o el environment del deploy en Vercel.`,
    );
  }
  return value;
}

/**
 * Base pública del sitio, de donde salen las tres URLs de retorno.
 *
 * `PUBLIC_SITE_URL` manda siempre: es lo que permite apuntar a un túnel
 * mientras se desarrolla. Si no está definida se cae a las variables que
 * Vercel inyecta sola, y ahí lo que decide NO es el orden sino el ambiente:
 *
 *   - En producción → VERCEL_PROJECT_PRODUCTION_URL, el dominio real.
 *   - En preview    → VERCEL_BRANCH_URL, el alias estable de la rama. No
 *     cambia entre deploys, así que el callback registrado sigue vivo.
 *   - VERCEL_URL → única por deploy, con hash. Último recurso: sirve para
 *     que no reviente, pero apunta a un deploy que quedará obsoleto.
 *
 * Mirar VERCEL_ENV es obligatorio y no un refinamiento: Vercel define
 * VERCEL_PROJECT_PRODUCTION_URL en TODOS los deploys, preview incluidos. Una
 * cadena de `??` que la pusiera primero nunca llegaría a la rama, y entonces
 * cada preview le pasaría a TUU las URLs de producción: el comprador de
 * prueba terminaría en el sitio real y el callback iría a confirmar una orden
 * que vive en otro deploy.
 */
function resolveSiteUrl(): string {
  const explicit = readEnv("PUBLIC_SITE_URL");
  if (explicit !== undefined) return explicit.replace(/\/+$/, "");

  const fromVercel =
    readEnv("VERCEL_ENV") === "production"
      ? (readEnv("VERCEL_PROJECT_PRODUCTION_URL") ?? readEnv("VERCEL_URL"))
      : (readEnv("VERCEL_BRANCH_URL") ?? readEnv("VERCEL_URL"));

  if (fromVercel === undefined) {
    throw new Error(
      "[tuu] Falta PUBLIC_SITE_URL y no se detectó un dominio de Vercel. " +
        "Define PUBLIC_SITE_URL con la base HTTPS del sitio, sin slash final.",
    );
  }

  return `https://${fromVercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
}

export function getTuuConfig(): TuuConfig {
  const name = (readEnv("TUU_ENV") ?? "qa").toLowerCase();
  if (name !== "qa" && name !== "prod") {
    throw new Error(`[tuu] TUU_ENV inválido: "${name}". Usa "qa" o "prod".`);
  }

  const siteUrl = resolveSiteUrl();
  if (!siteUrl.startsWith("https://")) {
    throw new Error(
      `[tuu] PUBLIC_SITE_URL debe ser HTTPS (recibido: "${siteUrl}"). ` +
        `TUU no acepta un callback en http ni en localhost: usa la URL del ` +
        `preview de Vercel o un túnel (cloudflared / ngrok).`,
    );
  }

  return {
    env: name,
    endpoint: ENDPOINTS[name],
    accountId: required("TUU_ACCOUNT_ID"),
    secretKey: required("TUU_SECRET_KEY"),
    shopName: required("TUU_SHOP_NAME"),
    siteUrl,
  };
}
