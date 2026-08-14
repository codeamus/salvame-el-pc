import { Resend } from "resend";

const resend = new Resend(import.meta.env.RESEND_API_KEY);

export async function enviarConfirmacionDePedido(params: {
  to: string;
  orderId: string;
  items: Array<{ title: string; quantity: number; unitPrice: number }>;
  total: number;
}) {
  const { to, orderId, items, total } = params;

  return resend.emails.send({
    from: import.meta.env.RESEND_FROM_EMAIL,
    to,
    subject: `Confirmamos tu pedido #${orderId} — Salvame el PC`,
    html: `
      <h1>¡Gracias por tu compra!</h1>
      <p>Tu pedido <strong>#${orderId}</strong> fue confirmado.</p>
      <ul>
        ${items
          .map(
            (i) =>
              `<li>${i.quantity}x ${i.title} — $${(i.unitPrice * i.quantity).toLocaleString("es-CL")}</li>`,
          )
          .join("")}
      </ul>
      <p><strong>Total: $${total.toLocaleString("es-CL")}</strong></p>
    `,
  });
}
