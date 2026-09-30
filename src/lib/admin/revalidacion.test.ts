import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dominiosDelProyecto, seRegenero } from "./revalidacion";

/**
 * Estos tests existen por un bug que costó tres rondas encontrar: el panel
 * publicaba de verdad, pero en un dominio distinto del que el editor tenía
 * abierto, y decía "sitio actualizado ✓" con toda razón.
 */

const ORIGINAL = { ...process.env };

/**
 * env.d.ts declara estas variables como readonly, que es correcto para el
 * código de la aplicación: nadie debería escribirlas en caliente. Un test
 * que simula distintos ambientes de Vercel es la excepción, y la excepción
 * queda acotada a esta función en vez de repartida por el archivo.
 */
function ponerEnv(clave: string, valor: string): void {
  (process.env as Record<string, string | undefined>)[clave] = valor;
}

function peticion(host: string): Request {
  return new Request(`https://${host}/api/admin/revalidar`, { method: "POST" });
}

beforeEach(() => {
  for (const clave of [
    "PUBLIC_SITE_URL",
    "VERCEL_ENV",
    "VERCEL_URL",
    "VERCEL_BRANCH_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
  ]) {
    delete process.env[clave];
  }
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("dominiosDelProyecto", () => {
  it("incluye el dominio desde el que se está editando", () => {
    // El caso real: salvame-el-pc.vercel.app es un alias asignado a mano al
    // entorno Preview. NINGUNA variable de Vercel lo nombra, así que sin
    // mirar la petición el panel jamás lo habría revalidado.
    ponerEnv("VERCEL_ENV", "preview");
    ponerEnv("VERCEL_BRANCH_URL", "proyecto-git-testing-equipo.vercel.app");

    const dominios = dominiosDelProyecto(peticion("salvame-el-pc.vercel.app"));

    expect(dominios).toContain("https://salvame-el-pc.vercel.app");
    expect(dominios).toContain("https://proyecto-git-testing-equipo.vercel.app");
  });

  it("descarta un Host inventado en vez de mandarle el token", () => {
    // El Host lo controla quien llama. Aceptarlo a ciegas sería regalarle el
    // token de revalidación a un dominio ajeno.
    ponerEnv("VERCEL_ENV", "preview");
    ponerEnv("VERCEL_BRANCH_URL", "proyecto-git-testing-equipo.vercel.app");

    const dominios = dominiosDelProyecto(peticion("evil.example.com"));

    expect(dominios).not.toContain("https://evil.example.com");
    expect(dominios).toEqual(["https://proyecto-git-testing-equipo.vercel.app"]);
  });

  it("acepta un dominio propio aunque no sea .vercel.app", () => {
    ponerEnv("VERCEL_ENV", "production");
    ponerEnv("VERCEL_PROJECT_PRODUCTION_URL", "salvameelpc.cl");

    expect(dominiosDelProyecto(peticion("salvameelpc.cl"))).toEqual(["https://salvameelpc.cl"]);
  });

  it("desde un preview NO toca el dominio de producción", () => {
    // Apunta a otro build, con su propia caché y su propio código:
    // revalidarlo sería tocar un sitio ajeno al cambio recién guardado.
    ponerEnv("VERCEL_ENV", "preview");
    ponerEnv("VERCEL_PROJECT_PRODUCTION_URL", "salvameelpc.cl");
    ponerEnv("VERCEL_BRANCH_URL", "proyecto-git-testing-equipo.vercel.app");

    const dominios = dominiosDelProyecto(peticion("salvame-el-pc.vercel.app"));

    expect(dominios).not.toContain("https://salvameelpc.cl");
  });

  it("no repite un dominio que llega por dos vías", () => {
    ponerEnv("VERCEL_ENV", "production");
    ponerEnv("VERCEL_PROJECT_PRODUCTION_URL", "salvameelpc.cl");
    ponerEnv("PUBLIC_SITE_URL", "https://salvameelpc.cl");

    const dominios = dominiosDelProyecto(peticion("salvameelpc.cl"));

    expect(dominios).toEqual(["https://salvameelpc.cl"]);
  });

  it("respeta el x-forwarded-host, que es el que trae el dominio público", () => {
    ponerEnv("VERCEL_ENV", "preview");
    ponerEnv("VERCEL_URL", "hash-unico.vercel.app");

    const req = new Request("https://interno.local/api/admin/revalidar", {
      method: "POST",
      headers: { "x-forwarded-host": "salvame-el-pc.vercel.app" },
    });

    expect(dominiosDelProyecto(req)).toContain("https://salvame-el-pc.vercel.app");
  });
});

describe("seRegenero", () => {
  function conCabecera(estado: string | null, status = 200): Response {
    return new Response("", {
      status,
      ...(estado === null ? {} : { headers: { "x-vercel-cache": estado } }),
    });
  }

  it("REVALIDATED, MISS y PRERENDER cuentan como regenerada", () => {
    expect(seRegenero(conCabecera("REVALIDATED"))).toBe(true);
    expect(seRegenero(conCabecera("MISS"))).toBe(true);
    expect(seRegenero(conCabecera("PRERENDER"))).toBe(true);
  });

  it("HIT significa que Vercel IGNORÓ la petición", () => {
    // Éste es el fallo que hay que ver: si el token no estuviera en el build,
    // Vercel devolvería la página cacheada con un 200 tranquilizador y el
    // panel cantaría victoria con el sitio mostrando lo viejo.
    expect(seRegenero(conCabecera("HIT"))).toBe(false);
  });

  it("un 404 con REVALIDATED sí cuenta: la página /404 responde 404 a propósito", () => {
    // Mirar response.ok daba "se publicaron 14 de 15" en cada guardado, y un
    // aviso de fallo que aparece siempre entrena a ignorarlo.
    expect(seRegenero(conCabecera("REVALIDATED", 404))).toBe(true);
  });

  it("sin cabecera de Vercel basta con que la página no reviente", () => {
    expect(seRegenero(conCabecera(null, 200))).toBe(true);
    expect(seRegenero(conCabecera(null, 404))).toBe(true);
    expect(seRegenero(conCabecera(null, 500))).toBe(false);
  });
});
