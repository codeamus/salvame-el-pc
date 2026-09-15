import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fotos adicionales de un producto.
 *
 * La foto PRINCIPAL se sigue editando arriba, en su propio campo: es la que
 * sale en el catálogo, en la portada y en la miniatura del panel. Esta
 * sección son las que se suman al carrusel de la ficha.
 *
 * Guarda al instante, sin botón: subir una foto y tener que acordarse de
 * darle "guardar" después es la forma más común de perderla. A cambio,
 * borrar pide confirmación — es lo único que no se puede deshacer.
 */

interface Props {
  supabase: SupabaseClient;
  /** null = producto nuevo, todavía sin id al que colgar las fotos. */
  productId: number | null;
  slug: string;
}

interface Foto {
  id: string;
  url: string;
  storage_path: string | null;
  alt: string;
  sort_order: number;
}

const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_BYTES = 5 * 1024 * 1024;

export default function GaleriaProducto({ supabase, productId, slug }: Props) {
  const [fotos, setFotos] = useState<Foto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async (): Promise<void> => {
    if (productId === null) {
      setFotos([]);
      return;
    }

    const { data, error: fallo } = await supabase
      .from("product_images")
      .select("id, url, storage_path, alt, sort_order")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true })
      .returns<Foto[]>();

    if (fallo !== null) {
      // El caso más probable acá es que falte correr la migración 0005. Se
      // dice en vez de mostrar el error crudo de Postgres.
      setError(
        fallo.message.includes("product_images")
          ? "Falta aplicar la migración 0005 en Supabase para poder subir varias fotos."
          : fallo.message,
      );
      setFotos([]);
      return;
    }

    setFotos(data);
    setError(null);
  }, [supabase, productId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function subir(archivos: FileList): Promise<void> {
    if (productId === null) return;
    setError(null);
    setSubiendo(true);

    let orden = (fotos?.at(-1)?.sort_order ?? 0) + 10;

    for (const archivo of archivos) {
      if (!TIPOS.includes(archivo.type)) {
        setError(`"${archivo.name}": formato no admitido. Usa JPG, PNG, WebP o AVIF.`);
        continue;
      }
      if (archivo.size > MAX_BYTES) {
        setError(`"${archivo.name}" pesa más de 5 MB. Expórtala más liviana.`);
        continue;
      }

      // Timestamp en el nombre por lo mismo que en la foto principal: con un
      // nombre repetido, el CDN seguiría sirviendo la imagen vieja.
      const extension = archivo.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const destino = `productos/${slug === "" ? "producto" : slug}-${String(Date.now())}-${String(orden)}.${extension}`;

      const { error: falloSubida } = await supabase.storage
        .from("media")
        .upload(destino, archivo, { cacheControl: "31536000", upsert: false });

      if (falloSubida !== null) {
        setError(`No se pudo subir "${archivo.name}": ${falloSubida.message}`);
        continue;
      }

      const { data } = supabase.storage.from("media").getPublicUrl(destino);

      const { error: falloFila } = await supabase.from("product_images").insert({
        product_id: productId,
        url: data.publicUrl,
        storage_path: destino,
        sort_order: orden,
      });

      if (falloFila !== null) {
        // La fila no entró: se limpia el archivo para no dejar basura en el
        // bucket que nada referencia.
        await supabase.storage.from("media").remove([destino]);
        setError(falloFila.message);
        continue;
      }

      orden += 10;
    }

    setSubiendo(false);
    if (inputRef.current !== null) inputRef.current.value = "";
    await cargar();
  }

  async function mover(foto: Foto, direccion: -1 | 1): Promise<void> {
    if (fotos === null) return;
    const indice = fotos.findIndex((f) => f.id === foto.id);
    const vecina = fotos[indice + direccion];
    if (vecina === undefined) return;

    // Se intercambian los sort_order, no las posiciones del arreglo: así el
    // orden sobrevive a recargar y es el mismo que ve el sitio.
    await Promise.all([
      supabase.from("product_images").update({ sort_order: vecina.sort_order }).eq("id", foto.id),
      supabase.from("product_images").update({ sort_order: foto.sort_order }).eq("id", vecina.id),
    ]);
    await cargar();
  }

  async function eliminar(foto: Foto): Promise<void> {
    const { error: fallo } = await supabase.from("product_images").delete().eq("id", foto.id);

    if (fallo !== null) {
      setError(fallo.message);
      return;
    }

    // El archivo se borra después de la fila, y solo si es nuestro: una URL
    // externa no es nuestra para eliminar.
    if (foto.storage_path !== null && foto.storage_path !== "") {
      await supabase.storage.from("media").remove([foto.storage_path]);
    }

    setConfirmando(null);
    await cargar();
  }

  if (productId === null) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] tracking-[.14em] text-muted uppercase">
          Fotos adicionales
        </span>
        <p className="border border-line-soft px-4 py-3 text-[13px] text-muted">
          Crea el producto primero. Después vuelve a abrirlo para sumarle fotos al carrusel.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="font-mono text-[11px] tracking-[.14em] text-muted uppercase">
        Fotos adicionales
      </span>
      <p className="-mt-1.5 text-[12px] text-faint">
        Se suman a la principal en el carrusel de la ficha, en este orden. Se guardan solas.
      </p>

      {error !== null && (
        <p role="alert" className="border border-coral px-4 py-3 text-[13px] text-coral">
          {error}
        </p>
      )}

      {fotos !== null && fotos.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {fotos.map((foto, indice) => (
            <div key={foto.id} className="w-28 border border-line-soft">
              <div className="stripes h-28 w-full overflow-hidden">
                <img src={foto.url} alt="" className="h-full w-full object-cover" />
              </div>

              <div className="flex items-center justify-between border-t border-line-soft px-1.5 py-1">
                <span className="flex gap-1">
                  <BotonMini
                    etiqueta="←"
                    titulo="Mover antes"
                    deshabilitado={indice === 0}
                    alHacerClic={() => void mover(foto, -1)}
                  />
                  <BotonMini
                    etiqueta="→"
                    titulo="Mover después"
                    deshabilitado={indice === fotos.length - 1}
                    alHacerClic={() => void mover(foto, 1)}
                  />
                </span>

                {confirmando === foto.id ? (
                  <span className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => void eliminar(foto)}
                      className="cursor-pointer border border-coral bg-coral px-1.5 font-mono text-[11px] text-on-coral"
                    >
                      sí
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmando(null)}
                      className="cursor-pointer border border-line-soft bg-transparent px-1.5 font-mono text-[11px]"
                    >
                      no
                    </button>
                  </span>
                ) : (
                  <BotonMini
                    etiqueta="✕"
                    titulo="Quitar foto"
                    alHacerClic={() => setConfirmando(foto.id)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={TIPOS.join(",")}
        multiple
        disabled={subiendo}
        onChange={(event) => {
          const archivos = event.target.files;
          if (archivos !== null && archivos.length > 0) void subir(archivos);
        }}
        className="max-w-sm text-[13px] file:mr-3 file:cursor-pointer file:border file:border-line file:bg-transparent file:px-3 file:py-1.5 file:text-[13px] file:font-bold"
      />
      {subiendo && <p className="font-mono text-[11px] text-muted">[ subiendo… ]</p>}
    </div>
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
      className="cursor-pointer border-none bg-transparent px-1 font-mono text-[12px] disabled:cursor-not-allowed disabled:opacity-30"
    >
      {etiqueta}
    </button>
  );
}
