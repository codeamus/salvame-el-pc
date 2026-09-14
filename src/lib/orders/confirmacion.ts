import { esPendiente, getSettings, texto } from "@/data/content";
import { enviarCorreo } from "@/lib/email/enviar";
import { confirmacionDePedido } from "@/lib/email/plantillas";
import { leerComprador } from "@/lib/admin/pedidos";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { OrderRecord } from "./store";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * CONFIRMACIÓN ESCRITA DE LA COMPRA
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La Ley 19.496 obliga a enviarle al comprador una confirmación escrita con
 * el detalle de lo comprado, el precio total con despacho incluido y la
 * forma de entrega. No enviarla extiende su derecho a retracto de 10 a
 * **90 días corridos**: es la diferencia entre poder cerrar una venta en
 * diez días y quedar expuesto tres meses.
 *
 * Nunca lanza. El pago ya está cobrado y confirmado cuando esto corre: un
 * proveedor de correo caído no puede volver atrás nada ni hacer que TUU
 * reintente el callback. Lo que sí hace es dejar constancia — la orden se
 * queda con `confirmation_sent_at` en null y el panel la muestra pendiente.
 */
export async function enviarConfirmacionDeCompra(orden: OrderRecord): Promise<void> {
  try {
    const ajustes = await getSettings();
    const comprador = leerComprador(orden.customer);

    if (comprador.correo === "") {
      console.error(`[confirmación] la orden ${orden.reference} no trae correo del comprador`);
      return;
    }

    const admin = getSupabaseAdmin();

    // Las líneas salen de order_items y no del jsonb del quote: es la misma
    // información, pero en la forma normalizada que también ve el panel.
    const { data: lineas } = await admin
      .from("order_items")
      .select("name, quantity, line_total_clp, orders!inner(reference)")
      .eq("orders.reference", orden.reference)
      .returns<{ name: string; quantity: number; line_total_clp: number }[]>();

    const plantilla = confirmacionDePedido({
      nombreTienda: texto(ajustes, "site.name", "Sálvame el PC"),
      nombreComprador: comprador.nombre,
      referencia: orden.reference,
      lineas: lineas ?? [],
      subtotalCLP: orden.quote.subtotalCLP,
      envioCLP: orden.quote.shippingCLP,
      totalCLP: orden.amountCLP,
      entrega: comprador.entrega,
      direccion: comprador.direccion,
      urlSitio: texto(ajustes, "site.url", "https://salvameelpc.cl"),
    });

    /*
     * Responder tiene que llegarle a una persona.
     *
     * Un comprador que recibe la confirmación y aprieta "responder" está
     * haciendo lo más natural del mundo: preguntar por su pedido. Sin
     * reply-to, esa respuesta va a la casilla desde la que se envía —que
     * puede ser un subdominio sin buzón— y le rebota. Perder ahí a alguien
     * que ya compró es de lo más caro que puede pasar.
     */
    const casillaDeContacto = texto(ajustes, "legal.correo_contacto");

    const envio = await enviarCorreo({
      para: comprador.correo,
      asunto: plantilla.asunto,
      html: plantilla.html,
      ...(casillaDeContacto === "" || esPendiente(casillaDeContacto)
        ? {}
        : { responderA: casillaDeContacto }),
    });

    if (!envio.ok) {
      console.error(`[confirmación] ${orden.reference} NO enviada: ${envio.motivo}`);
      return;
    }

    await admin
      .from("orders")
      .update({ confirmation_sent_at: new Date().toISOString() })
      .eq("reference", orden.reference);

    // No se registra el éxito en el log: la constancia que vale es la
    // columna confirmation_sent_at, que además sobrevive a la retención de
    // logs y es lo que habría que mostrar ante un reclamo.
  } catch (error) {
    // Cualquier cosa inesperada acá tampoco puede reventar el callback: TUU
    // interpretaría un 500 como fallo y reintentaría un pago ya confirmado.
    console.error(
      `[confirmación] error inesperado en ${orden.reference}:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}
