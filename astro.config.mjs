// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://salvameelpc.cl",

  // El sitio sigue siendo estático: catálogo, fichas y páginas legales se
  // generan en build time y Vercel las sirve desde su CDN. Solo las rutas
  // que declaran `export const prerender = false` se vuelven funciones
  // serverless — hoy, únicamente las tres del flujo de pago:
  //
  //   /api/checkout          crea el intento de pago en TUU
  //   /api/tuu/callback      recibe la notificación firmada (fuente de verdad)
  //   /api/orders/[reference] estado de la orden, para la página de resultado
  //
  // Pasar todo a output: "server" habría sacado el catálogo del CDN sin
  // ninguna necesidad. Ver docs/pagos-tuu.md.
  output: "static",
  adapter: vercel(),

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
