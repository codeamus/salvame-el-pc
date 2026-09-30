import type { SupabaseClient } from "@supabase/supabase-js";
import { atom } from "nanostores";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * PUBLICAR — llevar los cambios guardados al sitio público
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Guardar escribe en Supabase al instante, pero el sitio se sirve cacheado:
 * sin esto, un cambio de precio tardaría hasta que expire el caché.
 *
 * Se dispara SOLO después de cada guardado, en vez de dejarlo en un botón.
 * Un botón de "publicar" que hay que acordarse de apretar es una trampa: se
 * cambia un precio, no se publica, y el sitio queda mostrando el viejo
 * mientras uno cree que está actualizado. La interfaz avisa qué está
 * pasando; la decisión de publicar no es una decisión.
 *
 * Nunca lanza. Que la publicación falle no puede deshacer un guardado que sí
 * funcionó ni bloquear la pantalla: el peor caso es que el cambio tarde lo
 * que tarde el caché en expirar, y eso se informa sin alarmar.
 */

export type EstadoPublicacion =
  | { readonly fase: "inactivo" }
  | { readonly fase: "publicando" }
  | { readonly fase: "publicado"; readonly cuando: number }
  | { readonly fase: "aviso"; readonly mensaje: string };

/**
 * Estado compartido por todo el panel.
 *
 * Vive en un store y no en el estado de cada pantalla porque el indicador
 * está en la barra lateral, mientras que quien publica es el formulario de
 * turno. Nanostores ya es una dependencia del carrito: no suma peso.
 */
export const $publicacion = atom<EstadoPublicacion>({ fase: "inactivo" });

let enCurso = false;
let pendiente = false;

/**
 * Pide que el sitio se regenere.
 *
 * Si ya hay una publicación corriendo, se anota UNA sola repetición para el
 * final en vez de encolar todas. Alguien que guarda cinco secciones seguidas
 * dispararía cinco publicaciones completas del sitio; con esto son dos, y la
 * última ve todos los cambios de todos modos.
 */
export async function publicar(supabase: SupabaseClient): Promise<void> {
  if (enCurso) {
    pendiente = true;
    return;
  }

  enCurso = true;
  $publicacion.set({ fase: "publicando" });

  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (token === undefined) {
      $publicacion.set({ fase: "aviso", mensaje: "Sesión expirada: vuelve a entrar." });
      return;
    }

    const respuesta = await fetch("/api/admin/revalidar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    const cuerpo = (await respuesta.json()) as {
      ok?: boolean;
      mensaje?: string;
      publicadas?: number;
      total?: number;
    };

    if (!respuesta.ok) {
      $publicacion.set({
        fase: "aviso",
        mensaje: "Se guardó, pero no se pudo actualizar el sitio.",
      });
      return;
    }

    if (cuerpo.ok === true) {
      $publicacion.set({ fase: "publicado", cuando: Date.now() });
      return;
    }

    $publicacion.set({
      fase: "aviso",
      mensaje:
        cuerpo.mensaje ??
        `Se publicaron ${String(cuerpo.publicadas ?? 0)} de ${String(cuerpo.total ?? 0)} páginas.`,
    });
  } catch {
    $publicacion.set({
      fase: "aviso",
      mensaje: "Se guardó, pero no se pudo contactar al sitio para actualizarlo.",
    });
  } finally {
    enCurso = false;

    if (pendiente) {
      pendiente = false;
      void publicar(supabase);
    }
  }
}
