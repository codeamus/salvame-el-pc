import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import CampoDinamico from "./CampoDinamico";
import {
  aTextoEditable,
  construirContenido,
  deducirDescriptor,
  leerDescriptor,
  type DescriptorSeccion,
} from "@/lib/admin/contenido";

/**
 * Textos de todas las páginas del sitio.
 *
 * Cada sección se dibuja sola a partir de su descriptor `fields`, así que
 * esta pantalla no sabe nada de la portada ni del servicio técnico: sabe
 * leer descriptores. Agregar una sección al sitio es un INSERT.
 *
 * Se guarda sección por sección y no la página entera. Es más peticiones,
 * pero significa que un error al guardar el hero no se lleva por delante lo
 * que se acababa de escribir en el banner de más abajo.
 */

interface Props {
  supabase: SupabaseClient;
}

interface Pagina {
  slug: string;
  name: string;
  route: string;
  seo_title: string | null;
  seo_description: string | null;
  is_published: boolean;
}

interface Seccion {
  id: string;
  key: string;
  name: string;
  content: Record<string, unknown>;
  fields: unknown;
  is_visible: boolean;
  sort_order: number;
}

export default function EditorContenido({ supabase }: Props) {
  const [paginas, setPaginas] = useState<Pagina[] | null>(null);
  const [activa, setActiva] = useState<string | null>(null);
  const [secciones, setSecciones] = useState<Seccion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;

    void supabase
      .from("pages")
      .select("slug, name, route, seo_title, seo_description, is_published")
      .order("sort_order", { ascending: true })
      .returns<Pagina[]>()
      .then(({ data, error: fallo }) => {
        if (!vigente) return;
        if (fallo !== null) setError(fallo.message);
        else {
          setPaginas(data);
          setActiva((previa) => previa ?? data[0]?.slug ?? null);
        }
      });

    return () => {
      vigente = false;
    };
  }, [supabase]);

  const cargarSecciones = useCallback(
    async (slug: string): Promise<void> => {
      setSecciones(null);

      const { data: pagina } = await supabase
        .from("pages")
        .select("id")
        .eq("slug", slug)
        .maybeSingle<{ id: string }>();

      if (pagina === null) {
        setSecciones([]);
        return;
      }

      const { data, error: fallo } = await supabase
        .from("page_sections")
        .select("id, key, name, content, fields, is_visible, sort_order")
        .eq("page_id", pagina.id)
        .order("sort_order", { ascending: true })
        .returns<Seccion[]>();

      if (fallo !== null) setError(fallo.message);
      else setSecciones(data);
    },
    [supabase],
  );

  useEffect(() => {
    if (activa !== null) void cargarSecciones(activa);
  }, [activa, cargarSecciones]);

  if (paginas === null) {
    return <p className="px-6 py-16 font-mono text-[13px] text-muted sm:px-10">[ cargando… ]</p>;
  }

  return (
    <div className="px-6 py-10 sm:px-10">
      <p className="eyebrow">Sitio</p>
      <h1 className="mt-3 text-[40px] leading-none font-extrabold tracking-[-.04em] uppercase">
        Contenido<span className="text-coral">.</span>
      </h1>
      <p className="mt-4 max-w-[62ch] text-[15px] text-ink/70">
        Los textos de cada página. Se guarda una sección a la vez.
      </p>

      {error !== null && (
        <p role="alert" className="mt-6 border border-coral px-4 py-3 text-[13px] text-coral">
          {error}
        </p>
      )}

      <nav aria-label="Páginas" className="mt-8 flex flex-wrap gap-2">
        {paginas.map((pagina) => (
          <button
            key={pagina.slug}
            type="button"
            onClick={() => setActiva(pagina.slug)}
            aria-current={activa === pagina.slug ? "page" : undefined}
            className={[
              "cursor-pointer border border-line px-4 py-2 text-[13px] font-bold transition-colors",
              activa === pagina.slug
                ? "bg-ink text-cream"
                : "bg-transparent hover:bg-coral hover:text-on-coral",
            ].join(" ")}
          >
            {pagina.name}
            {!pagina.is_published && <span className="ml-2 font-mono text-[10px]">(oculta)</span>}
          </button>
        ))}
      </nav>

      {secciones === null ? (
        <p className="mt-8 font-mono text-[13px] text-muted">[ cargando secciones… ]</p>
      ) : secciones.length === 0 ? (
        <p className="mt-8 border border-line px-5 py-10 text-center text-[15px] text-muted">
          Esta página no tiene secciones de texto editables. Su contenido sale del catálogo.
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          {secciones.map((seccion) => (
            <TarjetaSeccion
              key={seccion.id}
              supabase={supabase}
              seccion={seccion}
              alGuardar={() => {
                if (activa !== null) void cargarSecciones(activa);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TarjetaSeccion({
  supabase,
  seccion,
  alGuardar,
}: {
  supabase: SupabaseClient;
  seccion: Seccion;
  alGuardar: () => void;
}) {
  const descriptor: DescriptorSeccion = useMemo(() => {
    const leido = leerDescriptor(seccion.fields);
    // Una sección sin `fields` quedaría como un formulario vacío y su
    // contenido inaccesible salvo por SQL. Se deduce del propio contenido.
    return Object.keys(leido).length > 0 ? leido : deducirDescriptor(seccion.content);
  }, [seccion.fields, seccion.content]);

  const [textos, setTextos] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {};
    for (const [clave, campo] of Object.entries(descriptor)) {
      if (campo.kind !== "boolean" && campo.of === undefined) {
        inicial[clave] = aTextoEditable(seccion.content[clave], campo.kind);
      }
    }
    return inicial;
  });

  const [crudos, setCrudos] = useState<Record<string, unknown>>(() => {
    const inicial: Record<string, unknown> = {};
    for (const [clave, campo] of Object.entries(descriptor)) {
      if (campo.kind === "boolean" || campo.of !== undefined) {
        inicial[clave] = seccion.content[clave] ?? (campo.kind === "boolean" ? false : []);
      }
    }
    return inicial;
  });

  const [errores, setErrores] = useState<Record<string, string>>({});
  const [estado, setEstado] = useState<"limpio" | "sucio" | "guardando" | "guardado">("limpio");
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  async function guardar(): Promise<void> {
    setErrorGeneral(null);

    const resultado = construirContenido(descriptor, textos, crudos);
    if (!resultado.ok) {
      setErrores(resultado.errores);
      return;
    }

    setErrores({});
    setEstado("guardando");

    const { error } = await supabase
      .from("page_sections")
      .update({ content: resultado.contenido })
      .eq("id", seccion.id);

    if (error !== null) {
      setErrorGeneral(error.message);
      setEstado("sucio");
      return;
    }

    setEstado("guardado");
    alGuardar();
  }

  async function alternarVisible(): Promise<void> {
    const { error } = await supabase
      .from("page_sections")
      .update({ is_visible: !seccion.is_visible })
      .eq("id", seccion.id);

    if (error !== null) setErrorGeneral(error.message);
    else alGuardar();
  }

  return (
    <section className="border border-line">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <span>
          <span className="text-[15px] font-extrabold tracking-[-.01em]">{seccion.name}</span>
          {/* La `key` es el contrato con el componente de Astro que lee esta
              sección. Se muestra pero no se edita: cambiarla dejaría la
              sección huérfana y el bloque desaparecería del sitio. */}
          <span className="ml-3 font-mono text-[11px] text-faint">{seccion.key}</span>
        </span>

        <button
          type="button"
          onClick={() => void alternarVisible()}
          className={[
            "cursor-pointer border px-2 py-0.5 font-mono text-[11px]",
            seccion.is_visible ? "border-line bg-ink text-cream" : "border-line-soft text-muted",
          ].join(" ")}
        >
          {seccion.is_visible ? "visible" : "oculta"}
        </button>
      </header>

      <div className="flex flex-col gap-5 px-5 py-6">
        {Object.entries(descriptor).map(([clave, campo]) => (
          <CampoDinamico
            key={clave}
            nombre={clave}
            campo={campo}
            texto={textos[clave] ?? ""}
            crudo={crudos[clave]}
            error={errores[clave]}
            alCambiarTexto={(valor) => {
              setTextos((previo) => ({ ...previo, [clave]: valor }));
              setEstado("sucio");
            }}
            alCambiarCrudo={(valor) => {
              setCrudos((previo) => ({ ...previo, [clave]: valor }));
              setEstado("sucio");
            }}
          />
        ))}

        {errorGeneral !== null && (
          <p role="alert" className="border border-coral px-4 py-3 text-[13px] text-coral">
            {errorGeneral}
          </p>
        )}

        <div className="flex items-center gap-4">
          <button
            type="button"
            className="btn-primary py-3"
            onClick={() => void guardar()}
            disabled={estado === "guardando" || estado === "limpio"}
          >
            {estado === "guardando" ? "Guardando…" : "Guardar sección →"}
          </button>

          {/* aria-live para que un lector de pantalla anuncie el resultado:
              sin esto, guardar no produce ninguna señal audible. */}
          <span aria-live="polite" className="font-mono text-[11px] text-muted">
            {estado === "guardado" && "guardado ✓"}
            {estado === "sucio" && "sin guardar"}
          </span>
        </div>
      </div>
    </section>
  );
}
