import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

const client = new MercadoPagoConfig({
  accessToken: import.meta.env.MERCADOPAGO_ACCESS_TOKEN,
  options: { timeout: 8000 },
});

export interface CrearPreferenciaInput {
  orderId: string;
  items: Array<{
    title: string;
    quantity: number;
    unitPrice: number; // CLP, precio final con IVA incluido
  }>;
  payerEmail?: string;
}

/**
 * Crea una preferencia de pago (Checkout Pro) y devuelve la URL a la que hay
 * que redirigir al cliente. El pago en sí ocurre 100% en el dominio de
 * MercadoPago — nuestro sitio nunca ve ni toca datos de tarjeta.
 */
export async function crearPreferenciaDePago({
  orderId,
  items,
  payerEmail,
}: CrearPreferenciaInput) {
  const preference = new Preference(client);

  const result = await preference.create({
    body: {
      items: items.map((item) => ({
        id: orderId,
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        currency_id: "CLP",
      })),
      payer: payerEmail ? { email: payerEmail } : undefined,
      external_reference: orderId, // así casamos el webhook con nuestra orden
      back_urls: {
        success: `${import.meta.env.PUBLIC_SITE_URL}/checkout/exito`,
        failure: `${import.meta.env.PUBLIC_SITE_URL}/checkout/error`,
        pending: `${import.meta.env.PUBLIC_SITE_URL}/checkout/pendiente`,
      },
      auto_return: "approved",
      notification_url: `${import.meta.env.PUBLIC_SITE_URL}/api/webhooks/mercadopago`,
    },
  });

  return { checkoutUrl: result.init_point, preferenceId: result.id };
}

/** Consulta el estado real de un pago contra la API de MercadoPago (no confiar solo en el payload del webhook). */
export async function obtenerPago(paymentId: string) {
  const payment = new Payment(client);
  return payment.get({ id: paymentId });
}
