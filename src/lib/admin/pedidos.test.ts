import { describe, expect, it } from "vitest";
import { esPendienteAntiguo, leerComprador, requiereAtencion, type PedidoAdmin } from "./pedidos";

function pedido(cambios: Partial<PedidoAdmin> = {}): PedidoAdmin {
  return {
    id: "uuid",
    reference: "ORD-20260913-ABC",
    status: "completed",
    fulfillment_status: "nuevo",
    amount_clp: 23980,
    customer: {},
    quote: {},
    last_notification: null,
    tuu_payment_id: null,
    admin_notes: null,
    needs_review: false,
    created_at: new Date().toISOString(),
    order_items: [],
    ...cambios,
  };
}

describe("leerComprador", () => {
  it("arma la dirección en una línea legible", () => {
    const c = leerComprador({
      nombre: "Ana Pérez",
      rut: "11.111.111-1",
      correo: "ana@ejemplo.cl",
      telefono: "+56911111111",
      entrega: "despacho",
      direccion: {
        calle: "Av. Siempre Viva 742",
        comuna: "Providencia",
        region: "Metropolitana",
        referencia: "Depto 3",
      },
    });

    expect(c.nombre).toBe("Ana Pérez");
    expect(c.direccion).toBe("Av. Siempre Viva 742, Providencia, Metropolitana, Depto 3");
    expect(c.entrega).toBe("Despacho a domicilio");
  });

  it("con entrega a coordinar no inventa una dirección", () => {
    // direccion en null no es un dato que falte: es la forma de entrega que
    // el comprador eligió.
    const c = leerComprador({ entrega: "acordar", direccion: null });
    expect(c.direccion).toBeNull();
    expect(c.entrega).toBe("Coordinar entrega");
  });

  it("tolera un jsonb incompleto sin reventar", () => {
    // El jsonb viene de pedidos viejos y de formularios que pudieron
    // cambiar: la pantalla de pedidos no puede caerse por un campo que
    // falta.
    const c = leerComprador({});
    expect(c.nombre).toBe("");
    expect(c.direccion).toBeNull();
  });

  it("ignora los campos vacíos de la dirección en vez de dejar comas sueltas", () => {
    const c = leerComprador({
      direccion: { calle: "Av. Uno 123", comuna: "", region: "Metropolitana", referencia: "  " },
    });
    expect(c.direccion).toBe("Av. Uno 123, Metropolitana");
  });
});

describe("requiereAtencion", () => {
  it("un pedido pagado sin preparar es trabajo por hacer", () => {
    expect(requiereAtencion(pedido({ status: "completed", fulfillment_status: "nuevo" }))).toBe(
      true,
    );
  });

  it("uno ya enviado no", () => {
    expect(requiereAtencion(pedido({ fulfillment_status: "enviado" }))).toBe(false);
  });

  it("uno sin pagar tampoco: no hay nada que preparar", () => {
    expect(requiereAtencion(pedido({ status: "pending" }))).toBe(false);
  });

  it("needs_review pide atención aunque ya esté enviado", () => {
    // Se cobró sin stock suficiente: la plata entró, así que no se puede
    // ignorar por más que la logística haya seguido su curso.
    expect(requiereAtencion(pedido({ needs_review: true, fulfillment_status: "enviado" }))).toBe(
      true,
    );
  });
});

describe("esPendienteAntiguo", () => {
  const ahora = Date.parse("2026-09-14T12:00:00Z");

  it("marca el que lleva más de un día sin confirmar", () => {
    // TUU tarda minutos. Uno pendiente al día siguiente o no se pagó, o su
    // callback se perdió; en los dos casos hay que conciliar.
    const viejo = pedido({ status: "pending", created_at: "2026-09-13T10:00:00Z" });
    expect(esPendienteAntiguo(viejo, ahora)).toBe(true);
  });

  it("no marca el de hace un rato", () => {
    const reciente = pedido({ status: "pending", created_at: "2026-09-14T11:30:00Z" });
    expect(esPendienteAntiguo(reciente, ahora)).toBe(false);
  });

  it("no marca los que ya tienen resultado", () => {
    const pagado = pedido({ status: "completed", created_at: "2026-09-01T10:00:00Z" });
    expect(esPendienteAntiguo(pagado, ahora)).toBe(false);
  });
});
