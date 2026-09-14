import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Foto del producto: subir un archivo o pegar una URL.
 *
 * Las dos vías conviven porque el catálogo sembrado todavía apunta a
 * Unsplash: obligar a subir archivo el primer día habría significado
 * reemplazar doce fotos antes de poder tocar un precio.
 *
 * Lo que se sube va al bucket `media`, que es público de lectura. Eso es a
 * propósito: las fotos se sirven directo desde el CDN de Supabase, sin URL
 * firmada ni proxy. Escribir en él sigue siendo solo del admin (ver las
 * políticas de storage en supabase/schema.sql).
 */

interface Props {
  url: string;
  path: string | null;
  slug: string;
  supabase: SupabaseClient;
  onChange: (foto: { url: string; path: string | null }) => void;
}

/** 5 MB. Una foto de producto bien exportada no pesa ni la décima parte. */
const MAX_BYTES = 5 * 1024 * 1024;

const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export default function CampoFoto({ url, path, slug, supabase, onChange }: Props) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function subir(archivo: File): Promise<void> {
    setError(null);

    if (!TIPOS.includes(archivo.type)) {
      setError("Formato no admitido. Usa JPG, PNG, WebP o AVIF.");
      return;
    }
    if (archivo.size > MAX_BYTES) {
      setError(
        `La imagen pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo son 5 MB. Expórtala más liviana.`,
      );
      return;
    }

    setSubiendo(true);

    /*
     * El nombre lleva timestamp y no es solo el slug.
     *
     * Con un nombre fijo, reemplazar la foto de un producto serviría la
     * imagen vieja durante horas: el CDN ya cacheó esa URL. Con un nombre
     * nuevo cada vez, la URL cambia y el cambio se ve al instante.
     */
    const extension = archivo.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const base = slug === "" ? "producto" : slug;
    const destino = `productos/${base}-${Date.now()}.${extension}`;

    const { error: fallo } = await supabase.storage.from("media").upload(destino, archivo, {
      cacheControl: "31536000",
      upsert: false,
    });

    if (fallo !== null) {
      setSubiendo(false);
      setError(
        /row-level security|unauthorized/i.test(fallo.message)
          ? "Tu sesión no tiene permiso para subir archivos. Vuelve a entrar."
          : fallo.message,
      );
      return;
    }

    const { data } = supabase.storage.from("media").getPublicUrl(destino);

    /*
     * La foto anterior se borra DESPUÉS de que la nueva subió bien.
     *
     * Al revés, un fallo de subida dejaría el producto sin foto y sin vuelta
     * atrás. Y solo se borra si estaba en nuestro bucket: las URLs externas
     * (Unsplash) no son nuestras para eliminar.
     */
    if (path !== null && path !== "") {
      await supabase.storage.from("media").remove([path]);
    }

    onChange({ url: data.publicUrl, path: destino });
    setSubiendo(false);
    if (inputRef.current !== null) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="font-mono text-[11px] tracking-[.14em] text-muted uppercase">Foto</span>

      <div className="flex flex-wrap items-start gap-4">
        <div className="stripes flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden border border-line">
          {url === "" ? (
            <span className="px-2 text-center font-mono text-[10px] text-faint">sin foto</span>
          ) : (
            // Sin next/image ni nada: es una vista previa de 112 px en una
            // pantalla interna, optimizarla sería trabajo sin beneficio.
            <img src={url} alt="" className="h-full w-full object-cover" />
          )}
        </div>

        <div className="flex min-w-55 flex-1 flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={TIPOS.join(",")}
            disabled={subiendo}
            onChange={(event) => {
              const archivo = event.target.files?.[0];
              if (archivo !== undefined) void subir(archivo);
            }}
            className="w-full text-[13px] file:mr-3 file:cursor-pointer file:border file:border-line file:bg-transparent file:px-3 file:py-1.5 file:text-[13px] file:font-bold"
          />

          <label className="sr-only" htmlFor="producto-foto-url">
            URL de la foto
          </label>
          <input
            id="producto-foto-url"
            type="url"
            className="field font-mono text-[12px]"
            placeholder="…o pega una URL"
            value={url}
            onChange={(event) => {
              // Al escribir una URL a mano, el path deja de aplicar: ese
              // archivo ya no es el que se está mostrando, y conservarlo haría
              // que la próxima subida borre algo que no corresponde.
              onChange({ url: event.target.value, path: null });
            }}
          />

          {subiendo && <p className="font-mono text-[11px] text-muted">[ subiendo… ]</p>}

          {error !== null && (
            <p role="alert" className="border border-coral px-3 py-2 text-[12px] text-coral">
              {error}
            </p>
          )}

          {path !== null && path !== "" && (
            <p className="font-mono text-[10px] break-all text-faint">{path}</p>
          )}
        </div>
      </div>
    </div>
  );
}
