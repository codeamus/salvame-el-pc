import type { ReactNode } from "react";
import { aTextoEditable, type DescriptorCampo } from "@/lib/admin/contenido";

/**
 * Un campo dibujado a partir de su descriptor.
 *
 * Es la pieza que hace que el panel no necesite una pantalla por página: el
 * formulario lee `fields` y este componente decide qué control mostrar. Que
 * mañana aparezca una sección nueva en el sitio es un INSERT, no un deploy.
 */

interface Props {
  nombre: string;
  campo: DescriptorCampo;
  /** Texto en edición, para todo lo que se escribe. */
  texto: string;
  /** Valor con forma propia: booleanos y listas de objetos. */
  crudo: unknown;
  error?: string | undefined;
  alCambiarTexto: (valor: string) => void;
  alCambiarCrudo: (valor: unknown) => void;
}

export default function CampoDinamico({
  nombre,
  campo,
  texto,
  crudo,
  error,
  alCambiarTexto,
  alCambiarCrudo,
}: Props) {
  // Lista de objetos: cada elemento es un grupo de campos repetible.
  if (campo.of !== undefined) {
    const elementos = Array.isArray(crudo) ? (crudo as Record<string, unknown>[]) : [];

    return (
      <Envoltorio campo={campo} error={error} comoEtiqueta={false}>
        <div className="flex flex-col gap-3">
          {elementos.map((elemento, indice) => (
            <div
              // El índice como key es aceptable acá y solo acá: estos
              // elementos no tienen id propio y el orden ES su identidad —
              // moverlos de lugar es precisamente lo que el admin quiere.
              key={indice}
              className="flex flex-col gap-3 border border-line-soft p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-muted">#{indice + 1}</span>
                <span className="flex gap-2">
                  <BotonMini
                    etiqueta="↑"
                    titulo="Subir"
                    deshabilitado={indice === 0}
                    alHacerClic={() => alCambiarCrudo(mover(elementos, indice, -1))}
                  />
                  <BotonMini
                    etiqueta="↓"
                    titulo="Bajar"
                    deshabilitado={indice === elementos.length - 1}
                    alHacerClic={() => alCambiarCrudo(mover(elementos, indice, 1))}
                  />
                  <BotonMini
                    etiqueta="✕"
                    titulo="Quitar"
                    alHacerClic={() =>
                      alCambiarCrudo(elementos.filter((_, otro) => otro !== indice))
                    }
                  />
                </span>
              </div>

              {Object.entries(campo.of ?? {}).map(([subNombre, subCampo]) => (
                <label key={subNombre} className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] tracking-[.12em] text-muted uppercase">
                    {subCampo.label}
                  </span>
                  {subCampo.kind === "textarea" ? (
                    <textarea
                      className="field resize-y text-[13px]"
                      rows={2}
                      value={aTextoEditable(elemento[subNombre], subCampo.kind)}
                      onChange={(event) =>
                        alCambiarCrudo(reemplazar(elementos, indice, subNombre, event.target.value))
                      }
                    />
                  ) : (
                    <input
                      className="field text-[13px]"
                      value={aTextoEditable(elemento[subNombre], subCampo.kind)}
                      onChange={(event) =>
                        alCambiarCrudo(reemplazar(elementos, indice, subNombre, event.target.value))
                      }
                    />
                  )}
                </label>
              ))}
            </div>
          ))}

          <button
            type="button"
            className="btn-secondary self-start py-2.5 text-[13px]"
            onClick={() => alCambiarCrudo([...elementos, vacio(campo)])}
          >
            + Agregar
          </button>
        </div>
      </Envoltorio>
    );
  }

  if (campo.kind === "boolean") {
    return (
      <label className="flex cursor-pointer items-start gap-3 py-1">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-coral"
          checked={crudo === true}
          onChange={(event) => alCambiarCrudo(event.target.checked)}
        />
        <span className="text-sm font-bold">
          {campo.label}
          {campo.help !== undefined && (
            <span className="block text-[12px] font-normal text-faint">{campo.help}</span>
          )}
        </span>
      </label>
    );
  }

  const largo = campo.kind === "textarea" || campo.kind === "list" || campo.kind === "json";

  return (
    <Envoltorio campo={campo} error={error} comoEtiqueta>
      {largo ? (
        <textarea
          className={`field resize-y ${campo.kind === "json" ? "font-mono text-[12px]" : ""}`}
          rows={campo.kind === "json" ? 6 : 4}
          value={texto}
          onChange={(event) => alCambiarTexto(event.target.value)}
        />
      ) : (
        <input
          className="field"
          type={tipoDeInput(campo.kind)}
          inputMode={campo.kind === "number" ? "numeric" : undefined}
          value={texto}
          onChange={(event) => alCambiarTexto(event.target.value)}
        />
      )}
      {campo.kind === "list" && error === undefined && (
        <span className="text-[12px] text-faint">Una por línea.</span>
      )}
      <span className="font-mono text-[10px] text-faint">{nombre}</span>
    </Envoltorio>
  );
}

function Envoltorio({
  campo,
  error,
  comoEtiqueta,
  children,
}: {
  campo: DescriptorCampo;
  error: string | undefined;
  comoEtiqueta: boolean;
  children: ReactNode;
}) {
  const contenido = (
    <>
      <span className="font-mono text-[11px] tracking-[.14em] text-muted uppercase">
        {campo.label}
      </span>
      {children}
      {campo.help !== undefined && error === undefined && (
        <span className="text-[12px] text-faint">{campo.help}</span>
      )}
      {error !== undefined && (
        <span role="alert" className="text-[12px] font-bold text-coral">
          {error}
        </span>
      )}
    </>
  );

  // Una lista de objetos contiene muchos controles: envolverla en un <label>
  // haría que un clic en el título enfocara uno arbitrario de ellos.
  return comoEtiqueta ? (
    <label className="flex flex-col gap-1.5">{contenido}</label>
  ) : (
    <div className="flex flex-col gap-1.5">{contenido}</div>
  );
}

function BotonMini({
  etiqueta,
  titulo,
  deshabilitado = false,
  alHacerClic,
}: {
  etiqueta: string;
  titulo: string;
  deshabilitado?: boolean;
  alHacerClic: () => void;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      disabled={deshabilitado}
      onClick={alHacerClic}
      className="cursor-pointer border border-line-soft bg-transparent px-2 py-0.5 font-mono text-[12px] disabled:cursor-not-allowed disabled:opacity-30"
    >
      {etiqueta}
    </button>
  );
}

function tipoDeInput(kind: DescriptorCampo["kind"]): string {
  if (kind === "url" || kind === "image") return "url";
  if (kind === "email") return "email";
  if (kind === "phone") return "tel";
  return "text";
}

function mover(
  elementos: Record<string, unknown>[],
  indice: number,
  delta: number,
): Record<string, unknown>[] {
  const copia = [...elementos];
  const destino = indice + delta;
  const actual = copia[indice];
  const otro = copia[destino];
  if (actual === undefined || otro === undefined) return elementos;

  copia[indice] = otro;
  copia[destino] = actual;
  return copia;
}

function reemplazar(
  elementos: Record<string, unknown>[],
  indice: number,
  clave: string,
  valor: string,
): Record<string, unknown>[] {
  return elementos.map((elemento, otro) =>
    otro === indice ? { ...elemento, [clave]: valor } : elemento,
  );
}

/** Elemento nuevo con todas las claves que el descriptor declara. */
function vacio(campo: DescriptorCampo): Record<string, unknown> {
  const nuevo: Record<string, unknown> = {};
  for (const clave of Object.keys(campo.of ?? {})) nuevo[clave] = "";
  return nuevo;
}
