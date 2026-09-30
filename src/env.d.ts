/**
 * Tipos de ambiente del proyecto.
 *
 * Se declaran sobre `process.env` y no sobre `import.meta.env`, y eso NO es
 * una preferencia de estilo: es lo que mantiene los secretos fuera del
 * bundle compilado.
 *
 * Astro carga el .env sin filtro de prefijo, así que Vite define
 * `import.meta.env` como un objeto que lleva TODAS las variables privadas
 * adentro. Basta con que un módulo del servidor lo mencione una vez para que
 * TUU_SECRET_KEY y la service role key de Supabase queden escritas, en
 * claro, dentro de la función serverless compilada. Por eso los módulos de
 * src/lib leen únicamente de process.env, que astro.config.mjs se encarga de
 * poblar desde el .env en desarrollo.
 *
 * Declararlas acá hace que un typo falle en `pnpm typecheck` en vez de en
 * producción.
 *
 * Ninguna lleva prefijo PUBLIC_ salvo PUBLIC_SITE_URL, que no es secreta.
 * Astro solo expone al navegador las que lo llevan — ver .env.example para
 * por qué ni siquiera la clave "pública" de Supabase lo usa.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    // ── TUU ───────────────────────────────────────────────────────────────
    /** "qa" (integración) o "prod". Define contra qué endpoint se habla. */
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

    // ── Supabase ──────────────────────────────────────────────────────────
    /** Base del proyecto: https://xxxx.supabase.co, sin slash final. */
    readonly SUPABASE_URL?: string;
    /**
     * Clave pública ("publishable"; antes "anon"). No es un secreto: lo único
     * que protege los datos con ella es el RLS de supabase/schema.sql.
     *
     * Aun así va sin prefijo PUBLIC_, así que no llega sola al navegador: el
     * panel la recibe como prop desde su página, renderizada en el servidor.
     */
    readonly SUPABASE_ANON_KEY?: string;
    /**
     * ⚠️ SECRETA. Pasa por encima de TODO el RLS: quien la tenga lee el RUT,
     * correo, teléfono y dirección de cada comprador, y puede marcar pedidos
     * como pagados.
     */
    readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  }
}
