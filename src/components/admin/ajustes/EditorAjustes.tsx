import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import CampoDinamico from "../contenido/CampoDinamico";
import {
  GRUPOS_AJUSTES,
  aTextoEditable,
  desdeTextoEditable,
  esPendiente,
  leerDescriptor,
  type ClaseCampo,
} from "@/lib/admin/contenido";

/**
 * Ajustes globales del sitio.
 *
 * Reemplaza a las constantes SITE, CONTACT, LEGAL y PROMO_TEXT de
 * antes vivían en el código, y a las reglas de envío de order-rules.ts.
 *
 * Reutiliza el mismo CampoDinamico que el editor de contenido: cada fila de
 * site_settings ya trae su `label`, su `kind` y su `help`, que es
 * exactamente la forma de un descriptor de un solo campo. Agregar un ajuste
 * nuevo es un INSERT.
 */

interface Props {
  supabase: SupabaseClient;
}

interface Ajuste {
  key: string;
  value: unknown;
  label: string;
  help: string | null;
  kind: ClaseCampo;
  group_key: string;
  sort_order: number;
}

export default function EditorAjustes({ supabase }: Props) {
  const [ajustes, setAjustes] = useState<Ajuste[] | null>(null);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [crudos, setCrudos] = useState<Record<string, unknown>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [sucios, setSucios] = useState<Set<string>>(new Set());
  const [estado, setEstado] = useState<"listo" | "guardando" | "guardado">("listo");
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    const { data, error: fallo } = await supabase
      .from("site_settings")
      .select("key, value, label, help, kind, group_key, sort_order")
      .order("group_key", { ascending: true })
      .order("sort_order", { ascending: true })
      .returns<Ajuste[]>();

    if (fallo !== null) {
      setError(fallo.message);
      return;
    }

    setAjustes(data);

    const nuevosTextos: Record<string, string> = {};
    const nuevosCrudos: Record<string, unknown> = {};
    for (const ajuste of data) {
      if (ajuste.kind === "boolean") nuevosCrudos[ajuste.key] = ajuste.value === true;
      else nuevosTextos[ajuste.key] = aTextoEditable(ajuste.value, ajuste.kind);
    }
    setTextos(nuevosTextos);
    setCrudos(nuevosCrudos);
    setSucios(new Set());
  }, [supabase]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar(): Promise<void> {
    if (ajustes === null || sucios.size === 0) return;

    setError(null);
    const nuevosErrores: Record<string, string> = {};
    const aGuardar: { key: string; value: unknown }[] = [];

    for (const ajuste of ajustes) {
      if (!sucios.has(ajuste.key)) continue;

      if (ajuste.kind === "boolean") {
        aGuardar.push({ key: ajuste.key, value: crudos[ajuste.key] === true });
        continue;
      }

      const resultado = desdeTextoEditable(textos[ajuste.key] ?? "", ajuste.kind);
      if (resultado.ok) aGuardar.push({ key: ajuste.key, value: resultado.valor });
      else nuevosErrores[ajuste.key] = resultado.error;
    }

    if (Object.keys(nuevosErrores).length > 0) {
      setErrores(nuevosErrores);
      return;
    }

    setErrores({});
    setEstado("guardando");

    /*
     * Un update por ajuste, en vez de un upsert masivo.
     *
     * El upsert necesitaría mandar TODAS las columnas de cada fila —label,
     * kind, help, group_key— y cualquier omisión las borraría. Acá solo se
     * toca `value`, que es lo único que el admin edita: la descripción del
     * campo es parte del esquema, no del dato.
     */
    for (const { key, value } of aGuardar) {
      const { error: fallo } = await supabase
        .from("site_settings")
        .update({ value })
        .eq("key", key);

      if (fallo !== null) {
        setError(`No se pudo guardar "${key}": ${fallo.message}`);
        setEstado("listo");
        return;
      }
    }

    setEstado("guardado");
    await cargar();
  }

  if (ajustes === null) {
    return (
      <p className="px-6 py-16 font-mono text-[13px] text-muted sm:px-10">
        {error ?? "[ cargando… ]"}
      </p>
    );
  }

  const grupos = [...new Set(ajustes.map((ajuste) => ajuste.group_key))];
  const pendientes = ajustes.filter((ajuste) => esPendiente(ajuste.value));

  return (
    <div className="px-6 py-10 sm:px-10">
      <p className="eyebrow">Sitio</p>
      <h1 className="mt-3 text-[40px] leading-none font-extrabold tracking-[-.04em] uppercase">
        Ajustes<span className="text-coral">.</span>
      </h1>
      <p className="mt-4 max-w-[62ch] text-[15px] text-ink/70">
        Nombre, contacto, datos legales y reglas de envío. Se usan en todo el sitio a la vez.
      </p>

      {/*
        Los placeholders del handoff llevan corchetes a propósito: la Ley
        19.496 obliga a informar quién vende, y publicar con "[ rut pendiente ]"
        es incumplimiento. El aviso va arriba y no escondido en cada campo.
      */}
      {pendientes.length > 0 && (
        <div className="mt-7 border border-coral px-5 py-4">
          <p className="text-[13px] font-bold text-coral">
            {pendientes.length} dato{pendientes.length === 1 ? "" : "s"} sin completar
          </p>
          <p className="mt-1.5 text-[13px] text-ink/75">
            Siguen con el texto de ejemplo. Los datos legales son obligatorios antes de vender: sin
            ellos el comprador no sabe a quién le está comprando.
          </p>
          <p className="mt-2 font-mono text-[11px] text-muted">
            {pendientes.map((ajuste) => ajuste.label).join(" · ")}
          </p>
        </div>
      )}

      {error !== null && (
        <p role="alert" className="mt-6 border border-coral px-4 py-3 text-[13px] text-coral">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-col gap-8">
        {grupos.map((grupo) => (
          <section key={grupo} className="border border-line">
            <h2 className="border-b border-line px-5 py-3 text-[15px] font-extrabold tracking-[-.01em] uppercase">
              {GRUPOS_AJUSTES[grupo] ?? grupo}
            </h2>

            <div className="flex flex-col gap-5 px-5 py-6">
              {ajustes
                .filter((ajuste) => ajuste.group_key === grupo)
                .map((ajuste) => (
                  <CampoDinamico
                    key={ajuste.key}
                    nombre={ajuste.key}
                    campo={
                      leerDescriptor({
                        [ajuste.key]: {
                          label: ajuste.label,
                          kind: ajuste.kind,
                          ...(ajuste.help === null ? {} : { help: ajuste.help }),
                        },
                      })[ajuste.key] ?? { label: ajuste.label, kind: "text" }
                    }
                    texto={textos[ajuste.key] ?? ""}
                    crudo={crudos[ajuste.key]}
                    error={errores[ajuste.key]}
                    alCambiarTexto={(valor) => {
                      setTextos((previo) => ({ ...previo, [ajuste.key]: valor }));
                      setSucios((previo) => new Set(previo).add(ajuste.key));
                    }}
                    alCambiarCrudo={(valor) => {
                      setCrudos((previo) => ({ ...previo, [ajuste.key]: valor }));
                      setSucios((previo) => new Set(previo).add(ajuste.key));
                    }}
                  />
                ))}
            </div>
          </section>
        ))}
      </div>

      {/*
        La barra queda pegada abajo: la lista de ajustes es larga y tener que
        volver al final para guardar un campo del principio es la forma
        segura de que alguien se vaya sin guardar.
      */}
      <div className="sticky bottom-0 mt-8 flex items-center gap-4 border-t border-line bg-cream py-4">
        <button
          type="button"
          className="btn-primary py-3"
          disabled={estado === "guardando" || sucios.size === 0}
          onClick={() => void guardar()}
        >
          {estado === "guardando" ? "Guardando…" : "Guardar cambios →"}
        </button>
        <span aria-live="polite" className="font-mono text-[11px] text-muted">
          {sucios.size > 0
            ? `${sucios.size} sin guardar`
            : estado === "guardado"
              ? "guardado ✓"
              : ""}
        </span>
      </div>
    </div>
  );
}
