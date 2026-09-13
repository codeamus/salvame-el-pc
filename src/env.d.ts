/**
 * Tipos de ambiente del proyecto.
 *
 * Declarar las variables acá hace que `import.meta.env.LO_QUE_SEA` quede
 * tipado y que un typo falle en `pnpm typecheck` en vez de en producción.
 *
 * Ninguna de las de TUU lleva prefijo PUBLIC_, y eso es deliberado: Astro
 * solo expone al navegador las que empiezan con PUBLIC_. La secret key con
 * la que se firma cada pago no puede salir del servidor bajo ninguna
 * circunstancia — quien la tenga puede marcar órdenes como pagadas.
 */

interface ImportMetaEnv {
  /** "qa" (integración) o "prod". Define contra qué endpoint de TUU se habla. */
  readonly TUU_ENV?: "qa" | "prod";
  /** ID de cuenta que entrega TUU. Distinto en QA y en producción. */
  readonly TUU_ACCOUNT_ID?: string;
  /** ⚠️ SECRETO. Firma HMAC de cada pago. Jamás en el repo ni en el cliente. */
  readonly TUU_SECRET_KEY?: string;
  /** Nombre del comercio que ve el comprador en la pasarela. */
  readonly TUU_SHOP_NAME?: string;
  /**
   * Base pública del sitio, HTTPS y sin slash final. De acá salen las tres
   * URLs de retorno (callback, éxito, cancelado). Si falta, se cae a las
   * variables que Vercel inyecta sola — ver src/lib/tuu/env.ts.
   */
  readonly PUBLIC_SITE_URL?: string;

  /** Base del proyecto de Supabase: https://xxxx.supabase.co, sin slash final. */
  readonly SUPABASE_URL?: string;
  /**
   * Clave pública ("publishable"; antes "anon"). No es un secreto: lo único
   * que protege los datos con esta clave es el RLS de supabase/schema.sql.
   *
   * Aun así va SIN prefijo PUBLIC_, así que no llega sola al navegador: el
   * panel la recibe como prop desde su página, renderizada en el servidor.
   * Vercel rechaza guardar un JWT detrás de un prefijo público, y de paso
   * evita hornear la clave en el bundle del sitio entero.
   */
  readonly SUPABASE_ANON_KEY?: string;
  /**
   * ⚠️ SECRETA. Pasa por encima de TODO el RLS: quien la tenga lee el RUT,
   * correo, teléfono y dirección de cada comprador, y puede marcar pedidos
   * como pagados. Sin prefijo PUBLIC_ a propósito.
   */
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
