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

export const PROMO_TEXT =
  "Envío gratis sobre $50.000 · Pago seguro con Mercado Pago · Despacho a todo Chile";
