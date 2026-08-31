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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
