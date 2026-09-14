// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

/*
 * ─────────────────────────────────────────────────────────────────────────
 * .env → process.env
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Astro expone las variables por `import.meta.env`, pero en el servidor eso
 * tiene un costo que no se ve: Astro las carga SIN filtro de prefijo
 * (`loadEnv(mode, dir, "")`) y Vite define `import.meta.env` como un
 * `Object.assign` que lleva TODAS las privadas adentro. Basta con que un
 * módulo del servidor lo mencione para que TUU_SECRET_KEY y la service role
 * key de Supabase queden escritas, en claro, dentro del bundle compilado —
 * verificado buscándolas en `.vercel/output`.
 *
 * No es una filtración pública (ese bundle no se le sirve a ningún
 * navegador), pero deja los secretos en artefactos de build y en la caché de
 * Vercel, y obliga a reconstruir para rotar una clave en vez de solo cambiar
 * la variable.
 *
 * Poblando process.env acá, los módulos del servidor leen únicamente de él y
 * no necesitan mencionar `import.meta.env` nunca. Así hay UNA sola fuente de
 * verdad —la misma en `astro dev` y dentro de una función de Vercel— y los
 * secretos no entran al bundle.
 *
 * Lo ya definido manda: en Vercel las variables reales vienen del entorno y
 * no hay .env que las pise.
 */
const archivoEnv = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
for (const [clave, valor] of Object.entries(archivoEnv)) {
  process.env[clave] ??= valor;
}

// https://astro.build/config
export default defineConfig({
  site: "https://salvameelpc.cl",

  // Estático por defecto: lo que no cambia se genera en el build y Vercel lo
  // sirve desde su CDN. Solo se vuelve función serverless lo que declara
  // `export const prerender = false`:
  //
  //   /                      portada — catálogo y textos editables
  //   /tienda                catálogo con filtros
  //   /producto/[slug]       ficha de producto
  //   /admin/[...ruta]       panel de administración
  //   /api/checkout          crea el intento de pago en TUU
  //   /api/tuu/callback      recibe la notificación firmada (fuente de verdad)
  //   /api/orders/[reference] estado de la orden, para la página de resultado
  //
  // Las tres primeras se sirven igual de rápido que antes gracias al ISR
  // configurado más abajo: Vercel cachea el HTML ya renderizado. Pasar todo a
  // output: "server" habría sacado del CDN también a las páginas legales y de
  // contacto, que no lo necesitan. Ver docs/pagos-tuu.md.
  output: "static",

  adapter: vercel({
    /*
     * ─────────────────────────────────────────────────────────────────────
     * ISR — el catálogo sigue sirviéndose como estático, pero sale de la base
     * ─────────────────────────────────────────────────────────────────────
     *
     * La portada, la tienda y las fichas de producto dejaron de generarse en
     * el build porque su contenido se edita desde el panel: prerenderizarlas
     * significaría un deploy por cada cambio de precio.
     *
     * Con ISR, Vercel renderiza la página la primera vez que alguien la pide
     * y guarda el HTML en su CDN. El resto de los visitantes reciben ese
     * archivo cacheado, igual de rápido que antes; la función solo vuelve a
     * correr cuando el contenido expira.
     *
     * ⚠️ `exclude` es la parte que no se puede equivocar. Sin esta lista,
     * Vercel cachearía TAMBIÉN las rutas de abajo, y cada una fallaría de una
     * forma distinta y difícil de notar:
     *
     *   /api/orders/[reference]  el estado del pago quedaría congelado en
     *                            "pendiente" para todos los compradores que
     *                            consultaran después — la página de éxito no
     *                            cambiaría nunca.
     *   /api/tuu/callback        la notificación de TUU es un POST, pero
     *                            cachear esta ruta es jugar con el mecanismo
     *                            que confirma los pagos. No se toca.
     *   /api/checkout            ídem: crea una orden, nunca se cachea.
     *   /api/admin/revalidar     es el que ORDENA regenerar: cacheado, el
     *                            sitio nunca se actualizaría.
     *   /admin                   sirve la clave de sesión del panel y depende
     *                            de quién mire. Cachearla sería servirle a un
     *                            visitante la respuesta preparada para otro.
     */
    isr: {
      /*
       * Quince minutos, y es solo una red de seguridad.
       *
       * Los cambios del panel no esperan esto: cada guardado dispara la
       * revalidación y el sitio se rehace en segundos. Esta expiración solo
       * actúa si esa llamada falla —sin token configurado, sin red—, y por
       * eso no es una hora: que un precio urgente tarde sesenta minutos
       * porque algo falló en silencio es demasiado.
       *
       * Tampoco es un minuto: sin cambios que publicar, cada expiración es
       * una regeneración que nadie pidió y que consume cuota del plan.
       */
      expiration: 15 * 60,

      // Los patrones son los de las RUTAS de Astro, no URLs sueltas: poner
      // solo "/admin" deja fuera el exacto y manda igual a la caché todo
      // /admin/loquesea, que es la ruta atrapa-todo del panel.
      exclude: [
        "/api/checkout",
        "/api/tuu/callback",
        "/api/orders/[reference]",
        // Cachear esto sería servir la respuesta de una publicación vieja y
        // que el sitio nunca se regenere.
        "/api/admin/revalidar",
        "/admin",
        "/admin/[...ruta]",
      ],

      /*
       * Permite invalidar la caché desde el panel sin esperar la expiración.
       *
       * Va por variable de entorno y no escrito acá: quien tenga este token
       * puede forzar el rerenderizado de cualquier página del sitio. Si falta
       * la variable, el ISR sigue funcionando y solo se pierde la
       * revalidación inmediata.
       */
      // El spread condicional no es adorno: con exactOptionalPropertyTypes,
      // pasar `bypassToken: undefined` no es lo mismo que no pasarlo, y el
      // adaptador rechaza el primero.
      ...(process.env.VERCEL_REVALIDATE_TOKEN === undefined
        ? {}
        : { bypassToken: process.env.VERCEL_REVALIDATE_TOKEN }),
    },
  }),

  security: {
    /*
     * ⚠️ Desactivado porque si no, NO SE PUEDE COBRAR.
     *
     * Astro trae `checkOrigin` activado: rechaza con 403 "Cross-site POST
     * form submissions are forbidden" cualquier POST cuyo Content-Type sea
     * de formulario (x-www-form-urlencoded, multipart, text/plain) y cuyo
     * header Origin no coincida con el sitio.
     *
     * El callback de TUU es precisamente eso: un POST server-to-server,
     * form-encoded y sin Origin —lo manda un servidor, no un navegador—. Con
     * la protección puesta, Astro lo rechaza ANTES de llegar a la ruta: el
     * pago se cobra, TUU reintenta 10 veces contra un 403 y la orden se
     * queda en "pending" para siempre. El comprador ve "Confirmando tu
     * pago…" de forma indefinida con la plata ya descontada.
     *
     * Por qué apagarlo no nos deja expuestos:
     *
     *   · /api/tuu/callback se autentica con FIRMA HMAC-SHA256 sobre el
     *     cuerpo completo. Eso es estrictamente más fuerte que un header
     *     Origin, que además un atacante controla. Sin la firma correcta no
     *     se marca nada: ver la verificación en la propia ruta.
     *   · /api/checkout recibe application/json, un content-type que el
     *     chequeo de Astro NUNCA cubrió: no perdemos una defensa que
     *     tuviéramos.
     *   · /api/orders/[reference] es GET y solo devuelve estado y monto.
     *
     * Si mañana aparece una ruta que reciba un formulario desde el navegador
     * y dependa de una cookie de sesión, esa ruta necesita su propia defensa
     * CSRF (token por formulario), porque esta ya no la cubre.
     */
    checkOrigin: false,
  },

  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],

    server: {
      /*
       * Hosts de túnel permitidos en `astro dev`.
       *
       * Vite responde 403 "Blocked request" a cualquier petición cuyo Host no
       * sea localhost. Es una defensa real contra DNS rebinding —una página
       * cualquiera resolviendo su dominio a 127.0.0.1 para hablarle a tu
       * servidor de desarrollo—, así que no se desactiva: se listan los
       * dominios de los túneles y nada más.
       *
       * Hace falta porque el flujo de pago no se puede probar en localhost:
       * TUU tiene que poder llegar al callback desde internet. Ver
       * docs/pagos-tuu.md § 6, "Probar el flujo completo en local".
       *
       * ⚠️ Nunca poner `true` acá: eso acepta cualquier Host y reabre
       * exactamente el agujero que esta lista existe para tapar.
       */
      allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.io", ".loca.lt"],
    },
  },

  build: {
    // Los estilos van en un solo archivo: menos requests para un sitio chico.
    inlineStylesheets: "auto",
  },
});
