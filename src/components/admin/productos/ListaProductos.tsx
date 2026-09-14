import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mensajeDeErrorSupabase, type ProductoAdmin } from "@/lib/admin/productos";
import { formatCLP } from "@/lib/format";

/**
 * Catálogo completo, con las acciones de cada producto.
 *
 * El filtro es en memoria a propósito: con doce productos —y con cien—
 * traerlos todos y filtrar en el navegador responde al instante y sin pedirle
 * nada a la red por cada tecla. El día que el catálogo no quepa en una
 * consulta, esto pasa a filtrar en el servidor y la tabla no se entera.
 */

interface Props {
  supabase: SupabaseClient;
  alEditar: (id: number) => void;
  alCrear: () => void;
}

const COLUMNAS =
  "id, slug, name, brand, category, price_clp, compare_at_price_clp, is_featured, photo_url, photo_path, photo_caption, specs, stock, track_stock, is_published, sort_order";

export default function ListaProductos({ supabase, alEditar, alCrear }: Props) {
  const [productos, setProductos] = useState<ProductoAdmin[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** id del producto cuya baja se está confirmando. */
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    const { data, error: fallo } = await supabase
      .from("products")
      .select(COLUMNAS)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .returns<ProductoAdmin[]>();

    if (fallo !== null) setError(mensajeDeErrorSupabase(fallo.message));
    else setProductos(data);
  }, [supabase]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtrados = useMemo(() => {
    if (productos === null) return [];
    const termino = busqueda.trim().toLowerCase();
    if (termino === "") return productos;

    return productos.filter((producto) =>
      [producto.name, producto.brand, producto.category, producto.slug]
        .join(" ")
        .toLowerCase()
        .includes(termino),
    );
  }, [productos, busqueda]);

  async function alternarPublicado(producto: ProductoAdmin): Promise<void> {
    setOcupado(producto.id);
    const { error: fallo } = await supabase
      .from("products")
      .update({ is_published: !producto.is_published })
      .eq("id", producto.id);

    if (fallo !== null) setError(mensajeDeErrorSupabase(fallo.message));
    else await cargar();
    setOcupado(null);
  }

  async function eliminar(producto: ProductoAdmin): Promise<void> {
    setOcupado(producto.id);
    setError(null);

    const { error: fallo } = await supabase.from("products").delete().eq("id", producto.id);

    if (fallo !== null) {
      /*
       * order_items referencia products con ON DELETE SET NULL, así que un
       * producto vendido se puede borrar y los pedidos históricos conservan
       * su nombre y su precio en la propia línea. Si aun así falla, el
       * mensaje real vale más que uno inventado.
       */
      setError(mensajeDeErrorSupabase(fallo.message));
      setOcupado(null);
      return;
    }

    // El archivo del bucket se borra después de la fila: al revés, un fallo
    // en el delete dejaría un producto apuntando a una imagen inexistente.
    if (producto.photo_path !== null && producto.photo_path !== "") {
      await supabase.storage.from("media").remove([producto.photo_path]);
    }

    setConfirmando(null);
    setOcupado(null);
    await cargar();
  }

  if (error !== null && productos === null) {
    return (
      <div className="px-6 py-16 sm:px-10">
        <p role="alert" className="border border-coral px-4 py-3 text-[13px] text-coral">
          {error}
        </p>
      </div>
    );
  }

  if (productos === null) {
    return <p className="px-6 py-16 font-mono text-[13px] text-muted sm:px-10">[ cargando… ]</p>;
  }

  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Catálogo</p>
          <h1 className="mt-3 text-[40px] leading-none font-extrabold tracking-[-.04em] uppercase">
            Productos<span className="text-coral">.</span>
          </h1>
        </div>
        <button type="button" className="btn-primary" onClick={alCrear}>
          Nuevo producto →
        </button>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <label className="sr-only" htmlFor="buscar-producto">
          Buscar producto
        </label>
        <input
          id="buscar-producto"
          type="search"
          className="field max-w-xs"
          placeholder="Buscar por nombre, marca o categoría"
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
        />
        <span className="font-mono text-[12px] text-muted" aria-live="polite">
          {filtrados.length} de {productos.length}
        </span>
      </div>

      {error !== null && (
        <p role="alert" className="mt-5 border border-coral px-4 py-3 text-[13px] text-coral">
          {error}
        </p>
      )}

      {filtrados.length === 0 ? (
        <p className="mt-8 border border-line px-5 py-10 text-center text-[15px] text-muted">
          {productos.length === 0
            ? "No hay productos todavía."
            : "Ningún producto coincide con la búsqueda."}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto border border-line">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-3 py-3" />
                <Encabezado>Producto</Encabezado>
                <Encabezado>Categoría</Encabezado>
                <Encabezado alineado="right">Precio</Encabezado>
                <Encabezado alineado="right">Stock</Encabezado>
                <Encabezado>Estado</Encabezado>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((producto) => (
                <tr
                  key={producto.id}
                  className="border-b border-line-soft align-middle last:border-b-0"
                >
                  <td className="py-2 pl-3">
                    <div className="stripes h-11 w-11 overflow-hidden border border-line-soft">
                      {producto.photo_url !== "" && (
                        <img
                          src={producto.photo_url}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <span className="font-bold">{producto.name}</span>
                    <span className="block font-mono text-[11px] text-muted">
                      {producto.brand}
                      {producto.is_featured && <span className="text-coral"> · destacado</span>}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-[13px]">{producto.category}</td>

                  <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                    {formatCLP(producto.price_clp)}
                    {producto.compare_at_price_clp !== null && (
                      <span className="block text-[11px] text-muted-soft line-through">
                        {formatCLP(producto.compare_at_price_clp)}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right font-mono text-[13px]">
                    {producto.track_stock ? (
                      <span className={producto.stock === 0 ? "text-coral" : undefined}>
                        {producto.stock}
                      </span>
                    ) : (
                      <span className="text-faint" title="Se vende sin controlar inventario">
                        —
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void alternarPublicado(producto)}
                      disabled={ocupado === producto.id}
                      // Es un botón y no una etiqueta: el estado se cambia
                      // desde acá, que es donde uno lo está mirando.
                      className={[
                        "cursor-pointer border px-2 py-0.5 font-mono text-[11px]",
                        producto.is_published
                          ? "border-line bg-ink text-cream"
                          : "border-line-soft text-muted",
                      ].join(" ")}
                    >
                      {producto.is_published ? "publicado" : "oculto"}
                    </button>
                  </td>

                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {confirmando === producto.id ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-[12px] font-bold text-coral">¿Eliminar?</span>
                        <button
                          type="button"
                          onClick={() => void eliminar(producto)}
                          disabled={ocupado === producto.id}
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
                          onClick={() => alEditar(producto.id)}
                          className="cursor-pointer border-none bg-transparent p-0 text-[13px] font-bold underline"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmando(producto.id)}
                          className="cursor-pointer border-none bg-transparent p-0 text-[13px] text-coral underline"
                        >
                          Eliminar
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Encabezado({
  children,
  alineado = "left",
}: {
  children: React.ReactNode;
  alineado?: "left" | "right";
}) {
  return (
    <th
      className={`px-4 py-3 font-mono text-[11px] tracking-[.14em] uppercase ${
        alineado === "right" ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}
