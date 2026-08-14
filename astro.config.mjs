// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://salvameelpc.cl",

  // Sitio 100% estático: no hay backend todavía. Todo el HTML se genera en
  // build time y Vercel lo sirve desde su CDN (sin funciones serverless).
  // Cuando se conecte el backend, cambiar a output: "server" y agregar el
  // adapter de Vercel — el resto del código no necesita cambios.
  output: "static",

  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
  },

  build: {
    // Los estilos van en un solo archivo: menos requests para un sitio chico.
    inlineStylesheets: "auto",
  },
});
