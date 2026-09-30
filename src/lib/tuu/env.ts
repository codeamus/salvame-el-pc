import { resolveSiteUrl } from "@/lib/site-url";
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
 * Lee una variable de entorno.
 *
 * SOLO de process.env, y eso es deliberado. Astro carga el .env sin filtro
 * de prefijo, así que Vite define `import.meta.env` como un objeto que lleva
 * TODAS las variables privadas adentro: mencionarlo en un módulo del
 * servidor basta para que los secretos queden escritos en claro dentro del
 * bundle compilado. Ver el comentario largo en astro.config.mjs, que es
 * donde el .env se vuelca a process.env para que esto funcione igual en
 * `astro dev` y dentro de una función de Vercel.
 */
function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value !== undefined && value !== "" ? value : undefined;
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
