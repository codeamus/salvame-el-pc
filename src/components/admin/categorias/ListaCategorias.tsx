import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cargarCategoriasConUso,
  mensajeDeErrorCategoria,
  validarNombreCategoria,
  type CategoriaConUso,
} from "@/lib/admin/categorias";

/**
 * Categorías del catálogo.
 *
 * Todo se edita en la propia fila y no en un formulario aparte: son tres
 * campos (nombre, orden, visible) y abrir una pantalla para cambiar una
 * palabra sería más clics que valor.
 *
 * Dos avisos que la interfaz tiene que dar antes de que la base los cobre:
 *
 *   · Renombrar mueve TODOS los productos de esa categoría. Es lo que hace
 *     el ON UPDATE CASCADE, y es lo que uno quiere — pero conviene saberlo
 *     antes de apretar.
 *   · Una categoría con productos no se puede borrar. Por eso la columna de
 *     uso está a la vista y el botón de borrar aparece deshabilitado, en vez
 *     de dejar que alguien lo apriete y reciba un error.
 */

interface Props {
  supabase: SupabaseClient;
}

export default function ListaCategorias({ supabase }: Props) {
  const [categorias, setCategorias] = useState<CategoriaConUso[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  /** Nombre en edición → texto escrito. */
  const [editando, setEditando] = useState<{ original: string; valor: string } | null>(null);
  const [nueva, setNueva] = useState("");

  const cargar = useCallback(async (): Promise<void> => {
    const resultado = await cargarCategoriasConUso(supabase);
    if ("error" in resultado) setError(resultado.error);
    else {
      setCategorias(resultado.datos);
      setError(null);
    }
  }, [supabase]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const nombres = (categorias ?? []).map((categoria) => categoria.name);

  async function crear(): Promise<void> {
    const problema = validarNombreCategoria(nueva, nombres);
    if (problema !== null) {
      setError(problema);
      return;
    }

    setOcupada("__nueva__");
    const siguiente = (categorias?.length ?? 0) * 10 + 10;

    const { error: fallo } = await supabase
      .from("categories")
      .insert({ name: nueva.trim(), sort_order: siguiente });

    setOcupada(null);
    if (fallo !== null) {
      setError(mensajeDeErrorCategoria(fallo.message));
      return;
    }

    setNueva("");
    await cargar();
  }

  async function renombrar(): Promise<void> {
    if (editando === null) return;

    const problema = validarNombreCategoria(editando.valor, nombres, editando.original);
    if (problema !== null) {
      setError(problema);
      return;
    }

    const limpio = editando.valor.trim();
    if (limpio === editando.original) {
      setEditando(null);
      return;
    }

    setOcupada(editando.original);
    // La base arrastra sola los productos: ON UPDATE CASCADE en la foránea.
    const { error: fallo } = await supabase
      .from("categories")
      .update({ name: limpio })
      .eq("name", editando.original);

    setOcupada(null);
    if (fallo !== null) {
      setError(mensajeDeErrorCategoria(fallo.message));
      return;
    }

    setEditando(null);
    await cargar();
  }

  async function actualizar(
    nombre: string,
    cambios: { sort_order?: number; is_visible?: boolean },
  ): Promise<void> {
    setOcupada(nombre);
    const { error: fallo } = await supabase.from("categories").update(cambios).eq("name", nombre);
    setOcupada(null);

    if (fallo !== null) setError(mensajeDeErrorCategoria(fallo.message));
    else await cargar();
  }

  async function eliminar(nombre: string): Promise<void> {
    setOcupada(nombre);
    const { error: fallo } = await supabase.from("categories").delete().eq("name", nombre);
    setOcupada(null);
    setConfirmando(null);

    if (fallo !== null) setError(mensajeDeErrorCategoria(fallo.message));
    else await cargar();
  }

  if (categorias === null) {
    return <p className="px-6 py-16 font-mono text-[13px] text-muted sm:px-10">[ cargando… ]</p>;
  }

  return (
    <div className="px-6 py-10 sm:px-10">
      <p className="eyebrow">Catálogo</p>
      <h1 className="mt-3 text-[40px] leading-none font-extrabold tracking-[-.04em] uppercase">
        Categorías<span className="text-coral">.</span>
      </h1>
      <p className="mt-4 max-w-[62ch] text-[15px] text-ink/70">
        Ordenan la portada y los filtros de la tienda. Renombrar una categoría mueve todos sus
        productos; para borrarla, primero tiene que quedar vacía.
      </p>

      {error !== null && (
        <p role="alert" className="mt-6 border border-coral px-4 py-3 text-[13px] text-coral">
          {error}
        </p>
      )}

      <div className="mt-7 overflow-x-auto border border-line">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-4 py-3 font-mono text-[11px] tracking-[.14em] uppercase">Nombre</th>
              <th className="w-24 px-4 py-3 text-right font-mono text-[11px] tracking-[.14em] uppercase">
                Orden
              </th>
              <th className="w-28 px-4 py-3 text-right font-mono text-[11px] tracking-[.14em] uppercase">
                Productos
              </th>
              <th className="w-28 px-4 py-3 font-mono text-[11px] tracking-[.14em] uppercase">
                Estado
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {categorias.map((categoria) => {
              const enEdicion = editando?.original === categoria.name;
              const bloqueada = ocupada === categoria.name;

              return (
                <tr key={categoria.name} className="border-b border-line-soft last:border-b-0">
                  <td className="px-4 py-2.5">
                    {enEdicion ? (
                      <input
                        className="field max-w-xs py-1.5"
                        value={editando.valor}
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- el input aparece por una acción explícita del usuario; no enfocarlo obligaría a volver a hacer clic en el campo que acaba de pedir editar
                        autoFocus
                        onChange={(event) =>
                          setEditando({ original: categoria.name, valor: event.target.value })
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void renombrar();
                          if (event.key === "Escape") setEditando(null);
                        }}
                      />
                    ) : (
                      <span className="font-bold">{categoria.name}</span>
                    )}
                  </td>

                  <td className="px-4 py-2.5 text-right">
                    <input
                      type="number"
                      className="field w-20 py-1.5 text-right font-mono"
                      value={categoria.sort_order}
                      disabled={bloqueada}
                      onChange={(event) =>
                        void actualizar(categoria.name, {
                          sort_order: Number(event.target.value),
                        })
                      }
                    />
                  </td>

                  <td className="px-4 py-2.5 text-right font-mono text-[13px]">
                    {categoria.productos}
                  </td>

                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      disabled={bloqueada}
                      onClick={() =>
                        void actualizar(categoria.name, { is_visible: !categoria.is_visible })
                      }
                      className={[
                        "cursor-pointer border px-2 py-0.5 font-mono text-[11px]",
                        categoria.is_visible
                          ? "border-line bg-ink text-cream"
                          : "border-line-soft text-muted",
                      ].join(" ")}
                    >
                      {categoria.is_visible ? "visible" : "oculta"}
                    </button>
                  </td>

                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {enEdicion ? (
                      <span className="inline-flex gap-3">
                        <button
                          type="button"
                          onClick={() => void renombrar()}
                          className="cursor-pointer border-none bg-transparent p-0 text-[13px] font-bold underline"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditando(null)}
                          className="cursor-pointer border-none bg-transparent p-0 text-[13px] text-muted underline"
                        >
                          Cancelar
                        </button>
                      </span>
                    ) : confirmando === categoria.name ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-[12px] font-bold text-coral">¿Borrar?</span>
                        <button
                          type="button"
                          onClick={() => void eliminar(categoria.name)}
                          className="cursor-pointer border border-coral bg-coral px-2 py-1 text-[12px] font-bold text-on-coral"
                        >
                          Sí
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmando(null)}
                          className="cursor-pointer border border-line bg-transparent px-2 py-1 text-[12px]"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setEditando({ original: categoria.name, valor: categoria.name })
                          }
                          className="cursor-pointer border-none bg-transparent p-0 text-[13px] font-bold underline"
                        >
                          Renombrar
                        </button>
                        <button
                          type="button"
                          disabled={categoria.productos > 0}
                          onClick={() => setConfirmando(categoria.name)}
                          title={
                            categoria.productos > 0
                              ? "Tiene productos: muévelos a otra categoría primero"
                              : undefined
                          }
                          className="cursor-pointer border-none bg-transparent p-0 text-[13px] text-coral underline disabled:cursor-not-allowed disabled:text-faint disabled:no-underline"
                        >
                          Borrar
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-7 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] tracking-[.14em] text-muted uppercase">
            Nueva categoría
          </span>
          <input
            className="field max-w-xs"
            placeholder="Ej: Sillas gamer"
            value={nueva}
            onChange={(event) => setNueva(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void crear();
            }}
          />
        </label>
        <button
          type="button"
          className="btn-primary py-3.5"
          disabled={ocupada === "__nueva__" || nueva.trim() === ""}
          onClick={() => void crear()}
        >
          Agregar →
        </button>
      </div>
    </div>
  );
}
