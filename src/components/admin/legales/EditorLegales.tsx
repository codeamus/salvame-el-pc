import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicar } from "@/lib/admin/publicar";

/**
 * Términos y condiciones, y política de privacidad.
 *
 * Tienen su propia pantalla y no viven en "Contenido" porque cargan una
 * exigencia que ninguna otra página tiene:
 *
 *   · El `anchor` de cada sección es un ENLACE PERMANENTE. El footer apunta
 *     a #despacho, y puede haber correos enviados que apunten a otro.
 *     Cambiarlo rompe enlaces vivos, así que se muestra pero no se edita.
 *   · La fecha de actualización tiene que cambiar cuando cambia EL TEXTO, no
 *     cuando se recompila el sitio. Ante un reclamo hay que poder demostrar
 *     qué versión estaba vigente el día de la compra — por eso es un campo,
 *     y por eso el editor la ofrece al guardar en vez de moverla solo.
 */

interface Props {
  supabase: SupabaseClient;
}

interface Documento {
  id: string;
  slug: string;
  title: string;
  intro: string;
  seo_description: string | null;
  content_updated_on: string;
}

interface SeccionLegal {
  id: string;
  anchor: string;
  title: string;
  body_html: string;
  sort_order: number;
}

export default function EditorLegales({ supabase }: Props) {
  const [documentos, setDocumentos] = useState<Documento[] | null>(null);
  const [activo, setActivo] = useState<string | null>(null);
  const [secciones, setSecciones] = useState<SeccionLegal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargarDocumentos = useCallback(async (): Promise<void> => {
    const { data, error: fallo } = await supabase
      .from("legal_documents")
      .select("id, slug, title, intro, seo_description, content_updated_on")
      .order("sort_order", { ascending: true })
      .returns<Documento[]>();

    if (fallo !== null) setError(fallo.message);
    else {
      setDocumentos(data);
      setActivo((previo) => previo ?? data[0]?.id ?? null);
    }
  }, [supabase]);

  useEffect(() => {
    void cargarDocumentos();
  }, [cargarDocumentos]);

  const cargarSecciones = useCallback(
    async (documentoId: string): Promise<void> => {
      setSecciones(null);
      const { data, error: fallo } = await supabase
        .from("legal_sections")
        .select("id, anchor, title, body_html, sort_order")
        .eq("document_id", documentoId)
        .order("sort_order", { ascending: true })
        .returns<SeccionLegal[]>();

      if (fallo !== null) setError(fallo.message);
      else setSecciones(data);
    },
    [supabase],
  );

  useEffect(() => {
    if (activo !== null) void cargarSecciones(activo);
  }, [activo, cargarSecciones]);

  if (documentos === null) {
    return (
      <p className="px-6 py-16 font-mono text-[13px] text-muted sm:px-10">
        {error ?? "[ cargando… ]"}
      </p>
    );
  }

  const documento = documentos.find((d) => d.id === activo);

  return (
    <div className="px-6 py-10 sm:px-10">
      <p className="eyebrow">Sitio</p>
      <h1 className="mt-3 text-[40px] leading-none font-extrabold tracking-[-.04em] uppercase">
        Legales<span className="text-coral">.</span>
      </h1>

      <div className="mt-6 border border-coral px-5 py-4">
        <p className="text-[13px] font-bold text-coral">Antes de cambiar algo acá</p>
        <p className="mt-1.5 max-w-[70ch] text-[13px] text-ink/75">
          Este texto es lo que el comprador acepta al comprar. Está redactado sobre la Ley 19.496 y
          la Ley 21.398, pero no reemplaza la revisión de un abogado. Los datos de la empresa (razón
          social, RUT, domicilio) se editan en <strong>Ajustes → Datos legales</strong> y aparecen
          solos en el documento.
        </p>
      </div>

      {error !== null && (
        <p role="alert" className="mt-6 border border-coral px-4 py-3 text-[13px] text-coral">
          {error}
        </p>
      )}

      <nav aria-label="Documentos" className="mt-8 flex flex-wrap gap-2">
        {documentos.map((doc) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => setActivo(doc.id)}
            aria-current={activo === doc.id ? "page" : undefined}
            className={[
              "cursor-pointer border border-line px-4 py-2 text-[13px] font-bold transition-colors",
              activo === doc.id
                ? "bg-ink text-cream"
                : "bg-transparent hover:bg-coral hover:text-on-coral",
            ].join(" ")}
          >
            {doc.title}
          </button>
        ))}
      </nav>

      {documento !== undefined && (
        <CabeceraDocumento
          key={documento.id}
          supabase={supabase}
          documento={documento}
          // Recargar solo la lista, no la página: un reload perdería lo que
          // se estuviera escribiendo en las secciones de más abajo.
          alGuardar={() => void cargarDocumentos()}
        />
      )}

      {secciones === null ? (
        <p className="mt-8 font-mono text-[13px] text-muted">[ cargando secciones… ]</p>
      ) : (
        <div className="mt-8 flex flex-col gap-5">
          {secciones.map((seccion) => (
            <TarjetaSeccionLegal
              key={seccion.id}
              supabase={supabase}
              seccion={seccion}
              slug={documento?.slug ?? ""}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CabeceraDocumento({
  supabase,
  documento,
  alGuardar,
}: {
  supabase: SupabaseClient;
  documento: Documento;
  alGuardar: () => void;
}) {
  const [titulo, setTitulo] = useState(documento.title);
  const [intro, setIntro] = useState(documento.intro);
  const [seo, setSeo] = useState(documento.seo_description ?? "");
  const [fecha, setFecha] = useState(documento.content_updated_on);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sucio =
    titulo !== documento.title ||
    intro !== documento.intro ||
    seo !== (documento.seo_description ?? "") ||
    fecha !== documento.content_updated_on;

  async function guardar(): Promise<void> {
    setGuardando(true);
    setError(null);

    const { error: fallo } = await supabase
      .from("legal_documents")
      .update({
        title: titulo,
        intro,
        seo_description: seo === "" ? null : seo,
        content_updated_on: fecha,
      })
      .eq("id", documento.id);

    setGuardando(false);
    if (fallo !== null) setError(fallo.message);
    else {
      void publicar(supabase);
      alGuardar();
    }
  }

  return (
    <section className="mt-6 border border-line px-5 py-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="font-mono text-[11px] tracking-[.14em] text-muted uppercase">
            Título
          </span>
          <input className="field" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="font-mono text-[11px] tracking-[.14em] text-muted uppercase">
            Bajada
          </span>
          <textarea
            className="field resize-y"
            rows={2}
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] tracking-[.14em] text-muted uppercase">
            Descripción SEO
          </span>
          <textarea
            className="field resize-y"
            rows={2}
            value={seo}
            onChange={(e) => setSeo(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] tracking-[.14em] text-muted uppercase">
            Última actualización
          </span>
          <input
            type="date"
            className="field font-mono"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
          <span className="text-[12px] text-faint">
            Muévela cuando cambies el TEXTO. Es lo que permite saber qué versión aceptó cada
            comprador.
          </span>
        </label>
      </div>

      {error !== null && (
        <p role="alert" className="mt-4 border border-coral px-4 py-3 text-[13px] text-coral">
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn-primary mt-6 py-3"
        disabled={!sucio || guardando}
        onClick={() => void guardar()}
      >
        {guardando ? "Guardando…" : "Guardar cabecera →"}
      </button>
    </section>
  );
}

function TarjetaSeccionLegal({
  supabase,
  seccion,
  slug,
}: {
  supabase: SupabaseClient;
  seccion: SeccionLegal;
  slug: string;
}) {
  const [titulo, setTitulo] = useState(seccion.title);
  const [cuerpo, setCuerpo] = useState(seccion.body_html);
  const [estado, setEstado] = useState<"limpio" | "sucio" | "guardando" | "guardado">("limpio");
  const [error, setError] = useState<string | null>(null);

  async function guardar(): Promise<void> {
    setEstado("guardando");
    setError(null);

    const { error: fallo } = await supabase
      .from("legal_sections")
      .update({ title: titulo, body_html: cuerpo })
      .eq("id", seccion.id);

    if (fallo !== null) {
      setError(fallo.message);
      setEstado("sucio");
      return;
    }
    setEstado("guardado");
    void publicar(supabase);
  }

  return (
    <section className="border border-line">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <span className="text-[15px] font-extrabold tracking-[-.01em]">{seccion.title}</span>
        {/*
          El ancla se muestra y no se edita. El footer enlaza a
          #despacho y puede haber correos enviados apuntando a otra: cambiarla
          rompe enlaces que ya están circulando.
        */}
        <a
          href={`/${slug}#${seccion.anchor}`}
          target="_blank"
          rel="noopener"
          className="font-mono text-[11px] text-faint"
          title="Enlace permanente — no se puede cambiar"
        >
          #{seccion.anchor} ↗
        </a>
      </header>

      <div className="flex flex-col gap-4 px-5 py-5">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] tracking-[.14em] text-muted uppercase">
            Título de la sección
          </span>
          <input
            className="field"
            value={titulo}
            onChange={(e) => {
              setTitulo(e.target.value);
              setEstado("sucio");
            }}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] tracking-[.14em] text-muted uppercase">Texto</span>
          <textarea
            className="field resize-y font-mono text-[12px] leading-relaxed"
            rows={10}
            value={cuerpo}
            onChange={(e) => {
              setCuerpo(e.target.value);
              setEstado("sucio");
            }}
          />
          <span className="text-[12px] text-faint">
            HTML simple: <code>&lt;p&gt;</code>, <code>&lt;ul&gt;</code>, <code>&lt;li&gt;</code>,{" "}
            <code>&lt;strong&gt;</code>, <code>&lt;a href&gt;</code>. Los <code>{"{{datos}}"}</code>{" "}
            salen de Ajustes: por ejemplo <code>{"{{legal.razon_social}}"}</code> o{" "}
            <code>{"{{shipping.cost_clp}}"}</code>, que se formatea solo como precio.
          </span>
        </label>

        {error !== null && (
          <p role="alert" className="border border-coral px-4 py-3 text-[13px] text-coral">
            {error}
          </p>
        )}

        <div className="flex items-center gap-4">
          <button
            type="button"
            className="btn-primary py-3"
            disabled={estado === "limpio" || estado === "guardando"}
            onClick={() => void guardar()}
          >
            {estado === "guardando" ? "Guardando…" : "Guardar sección →"}
          </button>
          <span aria-live="polite" className="font-mono text-[11px] text-muted">
            {estado === "guardado" && "guardado ✓"}
            {estado === "sucio" && "sin guardar"}
          </span>
        </div>
      </div>
    </section>
  );
}
