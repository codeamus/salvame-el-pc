import type { APIRoute } from "astro";
import { parseMensajeContacto } from "@/lib/contact-form";
import { getSettings, esPendiente, texto } from "@/data/content";
import { avisoDeContacto } from "@/lib/email/plantillas";
import { enviarCorreo } from "@/lib/email/enviar";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Formulario de contacto.
 *
 * Antes de esto, el formulario mostraba "mensaje enviado ✓" sin enviar nada:
 * una persona escribía, se iba tranquila, y su consulta no existía en
 * ninguna parte.
 *
 * El orden acá importa y es deliberado: PRIMERO se guarda, DESPUÉS se avisa
 * por correo. Un aviso que cae en spam, que alguien borra sin querer o que
 * falla porque el proveedor tuvo un mal día deja de ser un cliente perdido:
 * el mensaje sigue en la base y aparece en el panel. Al revés —enviar y
 * guardar solo si salió bien— habría vuelto el correo un punto único de
 * fallo para algo que solo necesita no perderse.
 */
export const prerender = false;

const json = (data: unknown, status: number): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

export const POST: APIRoute = async ({ request }) => {
  const cuerpo: unknown = await request.json().catch(() => null);
  const parsed = parseMensajeContacto(cuerpo);

  if (!parsed.ok) {
    // Un bot detectado recibe la misma respuesta que un envío correcto: que
    // crea que funcionó es mejor que enseñarle a esquivar la trampa.
    if (parsed.descartar === true) return json({ ok: true }, 200);
    return json({ error: parsed.error }, 400);
  }

  const mensaje = parsed.mensaje;
  const admin = getSupabaseAdmin();

  // ── 1. Guardar. Esto es lo que no se puede perder. ──────────────────────
  const { data: guardado, error: fallo } = await admin
    .from("contact_messages")
    .insert(mensaje)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (fallo !== null) {
    console.error(`[contacto] no se pudo guardar el mensaje: ${fallo.message}`);
    return json(
      { error: "No pudimos recibir tu mensaje. Inténtalo de nuevo o escríbenos por WhatsApp." },
      503,
    );
  }

  // ── 2. Avisar. Si falla, el mensaje ya está a salvo. ───────────────────
  const ajustes = await getSettings();
  const destino = texto(ajustes, "legal.correo_contacto");
  const nombreTienda = texto(ajustes, "site.name", "Sálvame el PC");

  // Con el placeholder del handoff todavía puesto no hay a dónde avisar. Se
  // registra para que se note en el log y el mensaje queda en el panel.
  if (destino === "" || esPendiente(destino)) {
    console.error(
      "[contacto] mensaje guardado pero SIN avisar: falta el correo de contacto en Ajustes → Datos legales.",
    );
    return json({ ok: true }, 200);
  }

  const plantilla = avisoDeContacto({ nombreTienda, ...mensaje });

  const envio = await enviarCorreo({
    para: destino,
    asunto: plantilla.asunto,
    html: plantilla.html,
    // Responder en el cliente de correo le escribe a quien mandó el mensaje,
    // no a la casilla de la tienda.
    responderA: mensaje.correo,
  });

  if (envio.ok && guardado !== null) {
    await admin
      .from("contact_messages")
      .update({ aviso_enviado_at: new Date().toISOString() })
      .eq("id", guardado.id);
  } else if (!envio.ok) {
    console.error(`[contacto] mensaje guardado pero el aviso falló: ${envio.motivo}`);
  }

  // Al visitante se le confirma igual: su mensaje LLEGÓ. Que el aviso interno
  // haya fallado es problema nuestro, no algo que él pueda resolver.
  return json({ ok: true }, 200);
};
