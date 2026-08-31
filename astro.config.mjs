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

  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
  },

  build: {
    // Los estilos van en un solo archivo: menos requests para un sitio chico.
    inlineStylesheets: "auto",
  },
});
