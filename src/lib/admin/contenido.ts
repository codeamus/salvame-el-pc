/**
 * ─────────────────────────────────────────────────────────────────────────
 * CONTENIDO — conversión entre lo que guarda la base y lo que se edita
 * ─────────────────────────────────────────────────────────────────────────
 *
 * El panel no tiene una pantalla escrita a mano por página. Tiene UN
 * formulario que se dibuja leyendo el descriptor `fields` de cada sección:
 *
 *   fields   {"heading": {"label": "Título", "kind": "text"}}
 *   content  {"heading": "Hardware y periféricos"}
 *
 * Eso es lo que permite agregar una sección nueva al sitio con un INSERT en
 * vez de con un deploy. El precio es que los valores viajan como jsonb sin
 * tipo fijo, y que un <input> solo sabe de strings — así que hace falta
 * traducir en las dos direcciones. Esa traducción vive acá, fuera de React,
 * porque es donde se rompe en silencio: un número guardado como "3990" en
 * vez de 3990 no falla en ninguna parte, simplemente deja de sumar.
 */

export type ClaseCampo =
  | "text"
  | "textarea"
  | "url"
  | "email"
  | "phone"
  | "number"
  | "boolean"
  | "image"
  | "list"
  | "json";

export interface DescriptorCampo {
  readonly label: string;
  readonly kind: ClaseCampo;
  readonly help?: string;
  /** Solo para `list` de objetos: describe los campos de cada elemento. */
  readonly of?: Readonly<Record<string, DescriptorCampo>>;
}

export type DescriptorSeccion = Readonly<Record<string, DescriptorCampo>>;

const CLASES: readonly string[] = [
  "text",
  "textarea",
  "url",
  "email",
  "phone",
  "number",
  "boolean",
  "image",
  "list",
  "json",
];

/**
 * Lee un descriptor venido de la base.
 *
 * Se valida en vez de confiar porque `fields` es jsonb: nada impide que
 * alguien escriba una clase que no existe editando la fila a mano. Un campo
 * con clase desconocida se degrada a "text" —que siempre sabe mostrar algo—
 * en lugar de romper la pantalla entera y dejar la página sin poder editarse.
 */
export function leerDescriptor(bruto: unknown): DescriptorSeccion {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return {};

  const salida: Record<string, DescriptorCampo> = {};

  for (const [clave, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (typeof valor !== "object" || valor === null) continue;

    const campo = valor as Record<string, unknown>;
    const kind =
      typeof campo.kind === "string" && CLASES.includes(campo.kind) ? campo.kind : "text";

    salida[clave] = {
      label: typeof campo.label === "string" && campo.label !== "" ? campo.label : clave,
      kind: kind as ClaseCampo,
      ...(typeof campo.help === "string" ? { help: campo.help } : {}),
      ...(campo.of !== undefined ? { of: leerDescriptor(campo.of) } : {}),
    };
  }

  return salida;
}

/**
 * Descriptor de emergencia para una sección sin `fields`.
 *
 * Sin esto, una sección mal sembrada se vería como un formulario vacío y su
 * contenido quedaría inaccesible desde el panel — invisible y sin forma de
 * arreglarlo salvo por SQL. Con esto se deduce del propio contenido: cada
 * clave se ofrece con la clase que corresponde a lo que hoy tiene guardado.
 */
export function deducirDescriptor(contenido: Record<string, unknown>): DescriptorSeccion {
  const salida: Record<string, DescriptorCampo> = {};

  for (const [clave, valor] of Object.entries(contenido)) {
    let kind: ClaseCampo = "text";
    if (typeof valor === "number") kind = "number";
    else if (typeof valor === "boolean") kind = "boolean";
    else if (Array.isArray(valor))
      kind = valor.every((x) => typeof x === "string") ? "list" : "json";
    else if (typeof valor === "object" && valor !== null) kind = "json";
    else if (typeof valor === "string" && valor.length > 90) kind = "textarea";

    salida[clave] = { label: clave, kind };
  }

  return salida;
}

/** Valor jsonb → texto para un input. */
export function aTextoEditable(valor: unknown, kind: ClaseCampo): string {
  if (valor === null || valor === undefined) return "";

  if (kind === "list") {
    // Una línea por elemento. Solo aplica a listas de strings: las de
    // objetos las edita otro componente.
    return Array.isArray(valor) ? valor.filter((x) => typeof x === "string").join("\n") : "";
  }

  if (kind === "json") {
    return JSON.stringify(valor, null, 2);
  }

  if (typeof valor === "string") return valor;
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);

  // Un objeto o un arreglo que llegó declarado con una clase que no es json
  // ni list: pasa cuando alguien cambia el `kind` de un campo que ya tenía
  // datos. Se muestra como JSON —editable y reversible— en vez de como
  // "[object Object]", que además de inútil se guardaría tal cual.
  return JSON.stringify(valor);
}

export type ResultadoCampo =
  { readonly ok: true; readonly valor: unknown } | { readonly ok: false; readonly error: string };

/** Texto de un input → valor jsonb listo para guardar. */
export function desdeTextoEditable(texto: string, kind: ClaseCampo): ResultadoCampo {
  if (kind === "number") {
    const limpio = texto.trim();
    if (limpio === "") return { ok: true, valor: 0 };

    const valor = Number(limpio.replace(/[$\s.]/g, ""));
    if (!Number.isFinite(valor)) return { ok: false, error: "Tiene que ser un número." };
    // Guardado como número y no como texto: el sitio lo formatea con
    // formatCLP y compara umbrales con él. Un "3990" entre comillas deja de
    // ser comparable sin que nada falle a la vista.
    return { ok: true, valor };
  }

  if (kind === "list") {
    return {
      ok: true,
      valor: texto
        .split("\n")
        .map((linea) => linea.trim())
        .filter((linea) => linea !== ""),
    };
  }

  if (kind === "json") {
    const limpio = texto.trim();
    if (limpio === "") return { ok: true, valor: null };

    try {
      return { ok: true, valor: JSON.parse(limpio) };
    } catch {
      // El mensaje crudo de JSON.parse ("Unexpected token } in JSON at
      // position 42") no le sirve a nadie que esté editando un menú.
      return { ok: false, error: "El JSON tiene un error de formato. Revisa comas y comillas." };
    }
  }

  return { ok: true, valor: texto };
}

/**
 * Valida y arma el `content` completo de una sección.
 *
 * Devuelve TODOS los errores y no solo el primero: si alguien rompió dos
 * campos, arreglar uno y que aparezca el otro es la forma más rápida de
 * perderle la paciencia a un formulario.
 */
export function construirContenido(
  descriptor: DescriptorSeccion,
  textos: Record<string, string>,
  crudos: Record<string, unknown>,
):
  | { ok: true; contenido: Record<string, unknown> }
  | { ok: false; errores: Record<string, string> } {
  const contenido: Record<string, unknown> = {};
  const errores: Record<string, string> = {};

  for (const [clave, campo] of Object.entries(descriptor)) {
    // Booleanos y listas de objetos no pasan por un input de texto: llegan
    // ya con su forma final desde el componente que los edita.
    if (campo.kind === "boolean" || campo.of !== undefined) {
      contenido[clave] = crudos[clave] ?? (campo.kind === "boolean" ? false : []);
      continue;
    }

    const resultado = desdeTextoEditable(textos[clave] ?? "", campo.kind);
    if (resultado.ok) contenido[clave] = resultado.valor;
    else errores[clave] = resultado.error;
  }

  if (Object.keys(errores).length > 0) return { ok: false, errores };
  return { ok: true, contenido };
}

/** Nombre legible de cada grupo de ajustes. */
export const GRUPOS_AJUSTES: Readonly<Record<string, string>> = {
  identidad: "Identidad",
  navegacion: "Navegación",
  contacto: "Contacto",
  comercio: "Comercio y envíos",
  legal: "Datos legales",
};

/**
 * ¿Sigue siendo un placeholder del handoff?
 *
 * Mismo criterio que `esPendiente` en src/config/site.ts: los corchetes son
 * un seguro deliberado para que un dato legal sin completar se vea a la
 * legua antes de salir a producción.
 */
export function esPendiente(valor: unknown): boolean {
  return typeof valor === "string" && valor.trimStart().startsWith("[");
}
