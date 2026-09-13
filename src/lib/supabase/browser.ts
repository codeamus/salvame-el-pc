import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * CLIENTE DE SUPABASE PARA EL NAVEGADOR — el que usa el panel
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Usa la clave pública, así que TODO lo que pueda hacer está limitado por el
 * Row Level Security de supabase/schema.sql. Ese es el modelo de seguridad
 * completo del panel, y conviene tenerlo claro antes de leer el resto:
 *
 *   · Sin sesión, esta clave solo lee contenido publicado. No ve un pedido,
 *     no escribe un producto, no puede cerrar un pago. Está verificado por
 *     `pnpm check:supabase`, que falla si alguna de esas tres cosas deja de
 *     ser cierta.
 *   · Con sesión de admin, las políticas dejan escribir el contenido.
 *
 * De ahí se sigue algo que suele confundir: **el guard de rutas del panel es
 * decorativo**. Que /admin redirija al login cuando no hay sesión es
 * comodidad de interfaz, no una defensa — quien edite el JavaScript en sus
 * devtools va a ver el dashboard vacío, porque la base no le va a responder
 * nada. La defensa está en Postgres, no en React.
 *
 * La configuración llega por argumento y no de import.meta.env porque las
 * variables no llevan prefijo PUBLIC_ (ver .env.example): la página /admin
 * las lee en el servidor y se las pasa al componente como props. Así la
 * clave viaja solo en la respuesta de /admin y no queda horneada en el
 * bundle de todo el sitio.
 */

export interface SupabaseBrowserConfig {
  readonly url: string;
  readonly anonKey: string;
}

let cached: SupabaseClient | null = null;

export function getSupabaseBrowser(config: SupabaseBrowserConfig): SupabaseClient {
  // Una sola instancia por pestaña. Dos clientes sobre el mismo storage se
  // pisan el token al refrescarlo y terminan cerrando la sesión solos.
  if (cached !== null) return cached;

  cached = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      /*
       * Detecta el token que Supabase deja en el hash de la URL al volver de
       * un correo (recuperar contraseña, invitación). Sin esto, esos enlaces
       * llegan al panel y no pasa nada visible.
       */
      detectSessionInUrl: true,
      /*
       * Clave propia en localStorage. La de por defecto se deriva del id del
       * proyecto, así que si mañana hay un segundo front sobre la misma base
       * (una app de bodega, por ejemplo) compartirían sesión sin quererlo.
       */
      storageKey: "salvameelpc.admin.auth",
    },
  });

  return cached;
}
