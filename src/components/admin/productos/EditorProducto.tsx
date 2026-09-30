import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import CampoFoto from "./CampoFoto";
import GaleriaProducto from "./GaleriaProducto";
import {
  FORMULARIO_VACIO,
  aFormulario,
  mensajeDeErrorSupabase,
  slugify,
  validarProducto,
  type ErroresProducto,
  type FormularioProducto,
  type ProductoAdmin,
} from "@/lib/admin/productos";
import { publicar } from "@/lib/admin/publicar";

/**
 * Alta y edición de un producto.
 *
 * El mismo componente sirve para los dos casos: la única diferencia real es
 * si al guardar se hace insert o update, y tener dos formularios casi
 * idénticos garantiza que se desincronicen en el primer campo nuevo.
 */

interface Props {
  supabase: SupabaseClient;
  /** null = producto nuevo. */
  id: number | null;
  alTerminar: () => void;
}

const COLUMNAS =
  "id, slug, name, brand, category, price_clp, compare_at_price_clp, is_featured, photo_url, photo_path, photo_caption, specs, stock, track_stock, is_published, sort_order";

export default function EditorProducto({ supabase, id, alTerminar }: Props) {
  const esNuevo = id === null;

  const [form, setForm] = useState<FormularioProducto>(FORMULARIO_VACIO);
  const [errores, setErrores] = useState<ErroresProducto>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [cargando, setCargando] = useState(!esNuevo);
  const [guardando, setGuardando] = useState(false);
  /** El slug deja de seguir al nombre en cuanto alguien lo escribe a mano. */
  const [slugManual, setSlugManual] = useState(!esNuevo);
  /** Las categorías ya no son una constante: se administran desde el panel. */
  const [categorias, setCategorias] = useState<string[]>([]);

  useEffect(() => {
    let vigente = true;

    void supabase
      .from("categories")
      .select("name")
      .order("sort_order", { ascending: true })
      .returns<{ name: string }[]>()
      .then(({ data }) => {
        if (!vigente || data === null) return;
        const nombres = data.map((fila) => fila.name);
        setCategorias(nombres);
        // Un producto nuevo arranca sin categoría; se preselecciona la
        // primera para que el <select> no muestre un valor que el formulario
        // no tiene. Nunca pisa la de un producto que se está editando.
        setForm((previo) =>
          previo.category === "" && nombres[0] !== undefined
            ? { ...previo, category: nombres[0] }
            : previo,
        );
      });

    return () => {
      vigente = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (esNuevo) return;
    let vigente = true;

    void supabase
      .from("products")
      .select(COLUMNAS)
      .eq("id", id)
      .maybeSingle<ProductoAdmin>()
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error !== null) setErrorGeneral(mensajeDeErrorSupabase(error.message));
        else if (data === null) setErrorGeneral("Ese producto ya no existe.");
        else setForm(aFormulario(data));
        setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, [supabase, id, esNuevo]);

  function actualizar<K extends keyof FormularioProducto>(
    campo: K,
    valor: FormularioProducto[K],
  ): void {
    setForm((previo) => {
      const siguiente = { ...previo, [campo]: valor };
      // Mientras nadie toque el slug, sigue al nombre. Es lo que espera quien
      // carga un producto sin pensar en URLs — y deja de hacerlo apenas
      // alguien decide la suya, para no pisársela al seguir escribiendo.
      if (campo === "name" && !slugManual) {
        siguiente.slug = slugify(String(valor));
      }
      return siguiente;
    });
  }

  async function guardar(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorGeneral(null);

    const validado = validarProducto(form, categorias);
    if (!validado.ok) {
      setErrores(validado.errores);
      return;
    }

    setErrores({});
    setGuardando(true);

    const { error } = esNuevo
      ? await supabase.from("products").insert(validado.valores)
      : await supabase.from("products").update(validado.valores).eq("id", id);

    setGuardando(false);

    if (error !== null) {
      setErrorGeneral(mensajeDeErrorSupabase(error.message));
      return;
    }

    void publicar(supabase);
    alTerminar();
  }

  if (cargando) {
    return <p className="px-6 py-16 font-mono text-[13px] text-muted sm:px-10">[ cargando… ]</p>;
  }

  return (
    <div className="px-6 py-10 sm:px-10">
      <p className="eyebrow">Productos</p>
      <h1 className="mt-3 mb-9 text-[40px] leading-none font-extrabold tracking-[-.04em] uppercase">
        {esNuevo ? "Nuevo" : "Editar"}
        <span className="text-coral">.</span>
      </h1>

      <form onSubmit={(event) => void guardar(event)} className="max-w-3xl">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Campo etiqueta="Nombre" error={errores.name} className="sm:col-span-2">
            <input
              className="field"
              value={form.name}
              onChange={(event) => actualizar("name", event.target.value)}
            />
          </Campo>

          <Campo
            etiqueta="URL del producto"
            error={errores.slug}
            ayuda={`salvameelpc.cl/producto/${form.slug === "" ? "…" : form.slug}`}
            className="sm:col-span-2"
          >
            <input
              className="field font-mono text-[13px]"
              value={form.slug}
              onChange={(event) => {
                setSlugManual(true);
                actualizar("slug", event.target.value);
              }}
            />
          </Campo>

          <Campo etiqueta="Marca" error={errores.brand}>
            <input
              className="field"
              value={form.brand}
              onChange={(event) => actualizar("brand", event.target.value)}
            />
          </Campo>

          <Campo etiqueta="Categoría" error={errores.category}>
            <select
              className="field"
              value={form.category}
              onChange={(event) => actualizar("category", event.target.value)}
            >
              {/* La categoría guardada va primero aunque ya no exista en la
                  lista: si alguien la ocultó o la renombró desde otra
                  pestaña, el <select> mostraría el primer valor y guardar
                  cambiaría la categoría sin que nadie lo pidiera. */}
              {!categorias.includes(form.category) && form.category !== "" && (
                <option>{form.category}</option>
              )}
              {categorias.map((categoria) => (
                <option key={categoria}>{categoria}</option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Precio (CLP)" error={errores.price_clp}>
            <input
              className="field font-mono"
              inputMode="numeric"
              placeholder="19990"
              value={form.price_clp}
              onChange={(event) => actualizar("price_clp", event.target.value)}
            />
          </Campo>

          <Campo
            etiqueta="Precio anterior"
            error={errores.compare_at_price_clp}
            ayuda="Vacío = sin oferta. Tiene que ser mayor que el precio actual."
          >
            <input
              className="field font-mono"
              inputMode="numeric"
              placeholder="24990"
              value={form.compare_at_price_clp}
              onChange={(event) => actualizar("compare_at_price_clp", event.target.value)}
            />
          </Campo>

          <Campo
            etiqueta="Especificaciones"
            ayuda="Una por línea. Se muestran como viñetas en la ficha."
            className="sm:col-span-2"
          >
            <textarea
              className="field resize-y font-mono text-[13px]"
              rows={5}
              placeholder={"Sensor óptico 10.000 DPI\nRGB 16.8M colores"}
              value={form.specs}
              onChange={(event) => actualizar("specs", event.target.value)}
            />
          </Campo>

          <div className="sm:col-span-2">
            <CampoFoto
              url={form.photo_url}
              path={form.photo_path}
              slug={form.slug}
              supabase={supabase}
              onChange={(foto) =>
                setForm((previo) => ({ ...previo, photo_url: foto.url, photo_path: foto.path }))
              }
            />
          </div>

          <div className="sm:col-span-2">
            <GaleriaProducto supabase={supabase} productId={id} slug={form.slug} />
          </div>

          <Campo
            etiqueta="Pie de foto"
            ayuda="Se ve si la imagen no carga. Vacío = se genera del nombre."
            className="sm:col-span-2"
          >
            <input
              className="field font-mono text-[13px]"
              placeholder="[ foto: mouse redragon ]"
              value={form.photo_caption}
              onChange={(event) => actualizar("photo_caption", event.target.value)}
            />
          </Campo>

          <Campo etiqueta="Stock" error={errores.stock}>
            <input
              className="field font-mono"
              inputMode="numeric"
              value={form.stock}
              onChange={(event) => actualizar("stock", event.target.value)}
            />
          </Campo>

          <Campo
            etiqueta="Orden en la tienda"
            error={errores.sort_order}
            ayuda="Menor aparece primero."
          >
            <input
              className="field font-mono"
              inputMode="numeric"
              value={form.sort_order}
              onChange={(event) => actualizar("sort_order", event.target.value)}
            />
          </Campo>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-line-soft pt-6">
          <Casilla
            marcado={form.is_published}
            alCambiar={(valor) => actualizar("is_published", valor)}
            etiqueta="Publicado"
            ayuda="Sin esto no se ve en la tienda, ni siquiera con el enlace directo."
          />
          <Casilla
            marcado={form.is_featured}
            alCambiar={(valor) => actualizar("is_featured", valor)}
            etiqueta="Destacado en la portada"
            ayuda="La portada muestra los primeros 4."
          />
          <Casilla
            marcado={form.track_stock}
            alCambiar={(valor) => actualizar("track_stock", valor)}
            etiqueta="Controlar stock"
            ayuda="Apagado = se vende siempre, sin descontar inventario."
          />
        </div>

        {errorGeneral !== null && (
          <p role="alert" className="mt-6 border border-coral px-4 py-3 text-[13px] text-coral">
            {errorGeneral}
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <button type="submit" className="btn-primary" disabled={guardando}>
            {guardando ? "Guardando…" : esNuevo ? "Crear producto →" : "Guardar cambios →"}
          </button>
          <button type="button" className="btn-secondary" onClick={alTerminar}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

function Campo({
  etiqueta,
  ayuda,
  error,
  className = "",
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  error?: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    // El <label> envuelve al control, así no hace falta coordinar ids: el
    // clic en el texto enfoca el campo igual.
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="font-mono text-[11px] tracking-[.14em] text-muted uppercase">
        {etiqueta}
      </span>
      {children}
      {ayuda !== undefined && error === undefined && (
        <span className="text-[12px] text-faint">{ayuda}</span>
      )}
      {error !== undefined && (
        <span role="alert" className="text-[12px] font-bold text-coral">
          {error}
        </span>
      )}
    </label>
  );
}

function Casilla({
  marcado,
  alCambiar,
  etiqueta,
  ayuda,
}: {
  marcado: boolean;
  alCambiar: (valor: boolean) => void;
  etiqueta: string;
  ayuda: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 accent-coral"
        checked={marcado}
        onChange={(event) => alCambiar(event.target.checked)}
      />
      <span className="text-sm font-bold">
        {etiqueta}
        <span className="block text-[12px] font-normal text-faint">{ayuda}</span>
      </span>
    </label>
  );
}
