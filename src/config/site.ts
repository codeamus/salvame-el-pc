/**
 * Configuración estática del sitio. Centralizada acá para que el nombre,
 * la navegación o los datos de contacto se cambien en un solo lugar.
 */

export interface NavLink {
  readonly href: string;
  readonly label: string;
}

export const SITE = {
  name: "Sálvame el PC",
  tagline: "Hardware y periféricos sin vueltas",
  description:
    "Tienda de hardware y periféricos en Santiago, Chile: mouse, teclados, RAM, audífonos, monitores y GPU. Servicio técnico y despacho a todo el país.",
  url: "https://salvameelpc.cl",
  locale: "es-CL",
} as const;

export const MAIN_NAV: readonly NavLink[] = [
  { href: "/tienda", label: "Tienda" },
  { href: "/servicio-tecnico", label: "Servicio técnico" },
  { href: "/contacto", label: "Contacto" },
];

/**
 * Datos de contacto reales pendientes del cliente — el handoff usa estos
 * placeholders. Cambiarlos acá los actualiza en header, footer y páginas.
 */
export const CONTACT = {
  whatsappDisplay: "+56 9 0000 0000",
  whatsappUrl: "https://wa.me/56900000000",
  instagramHandle: "@salvamelpc",
  instagramUrl: "https://instagram.com",
  address: ["Av. Providencia 1234, local 56", "Providencia, Santiago"],
  hours: ["Lun a Vie · 10:00 — 19:00", "Sábado · 10:00 — 14:00"],
} as const;

/**
 * Datos que las páginas legales necesitan por obligación y que solo puede
 * entregar el cliente.
 *
 * Van con el mismo formato de placeholder que el resto del prototipo
 * ([ foto: … ], [ mapa: … ]) para que sea IMPOSIBLE publicarlos por error:
 * si el sitio sale a producción con esto puesto, se ve a la legua. La Ley
 * 19.496 exige que el consumidor sepa exactamente a quién le está
 * comprando, así que estos tres campos no son opcionales.
 */
export const LEGAL = {
  razonSocial: "[ razón social pendiente ]",
  rut: "[ rut pendiente ]",
  /** Domicilio legal. Puede coincidir con CONTACT.address o no. */
  domicilio: "[ domicilio legal pendiente ]",
  /** Casilla para ejercer derechos sobre datos personales (ARCOP). */
  correoDatos: "[ correo de datos pendiente ]",
  /** Casilla para reclamos y consultas de compras. */
  correoContacto: "[ correo de contacto pendiente ]",
  /**
   * Última actualización de los documentos legales, en ISO.
   *
   * Es una constante y no `new Date()`: la fecha tiene que cambiar cuando
   * cambia el TEXTO, no cuando se recompila el sitio. Un documento legal que
   * dice "actualizado hoy" en cada build no le sirve a nadie —ni al
   * consumidor ni ante un reclamo— porque deja de ser trazable qué versión
   * aceptó cada persona.
   */
  actualizado: "2026-08-19",
} as const;

/** Un valor sigue siendo placeholder si conserva los corchetes del handoff. */
export function esPendiente(valor: string): boolean {
  return valor.trimStart().startsWith("[");
}

export const PROMO_TEXT =
  "Envío gratis sobre $50.000 · Pago seguro con Mercado Pago · Despacho a todo Chile";
