/**
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ PÁGINAS SE REHACEN AL PUBLICAR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Las fichas de producto se agregan aparte, desde la base: son las únicas
 * que dependen de qué haya publicado.
 *
 * La lista vive acá y no dentro del endpoint por una razón concreta: hay un
 * test que la compara contra los archivos de src/pages y falla si aparece
 * una página que nadie revalida. Esa comprobación existe porque ya pasó al
 * revés — el endpoint decía en su comentario que revalidaba "el sitio
 * entero" y en realidad tenía tres rutas. Contacto, servicio técnico y los
 * dos documentos legales se publicaban sin efecto visible: el panel decía
 * que sí, y el cambio aparecía cuando expiraba el caché, hasta un cuarto de
 * hora después. Para quien administra el sitio, eso es indistinguible de
 * que la publicación no funcione.
 */
export const RUTAS_DE_CONTENIDO: readonly string[] = [
  "/",
  "/tienda",
  "/servicio-tecnico",
  "/contacto",
  "/terminos-y-condiciones",
  "/politica-de-privacidad",
  "/carrito",
  "/checkout",
  "/pago/exito",
  "/pago/cancelado",
  "/404",
];

/**
 * Páginas que NO se revalidan, con el motivo.
 *
 * Está escrito para que el test sepa distinguir "esta página está exenta a
 * propósito" de "a alguien se le olvidó agregarla".
 */
export const RUTAS_EXENTAS: Readonly<Record<string, string>> = {
  // El panel se renderiza a pedido y detrás de sesión: nunca se cachea, así
  // que no hay nada que rehacer.
  "/admin": "el panel no se cachea",
  // Sale de la base en cada publicación, no de una lista fija.
  "/producto/[slug]": "se agregan desde products",
};
