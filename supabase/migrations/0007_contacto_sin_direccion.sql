-- ════════════════════════════════════════════════════════════════════════
-- 0007 — CONTACTO SIN DIRECCIÓN NI MAPA
-- ════════════════════════════════════════════════════════════════════════
--
-- Correr en Supabase → SQL Editor, después de 0006. Es idempotente.
--
-- ⚠️ ORDEN: aplicar DESPUÉS de desplegar el código. Esta migración BORRA
-- ajustes, y el deploy viejo los sigue leyendo: entre una cosa y la otra, la
-- página de contacto mostraría el rótulo "Taller y tienda" con la dirección
-- en blanco debajo. Ya pasó una vez con los enlaces de Instagram — se
-- borraron los ajustes con el código viejo todavía arriba y el footer quedó
-- apuntando a "#" en vivo.
--
-- Si ya corriste la 0006, no pasa nada: esta borra la fila cuyo rótulo
-- aquella acababa de arreglar. Si NO la corriste, tampoco: salta a esta.
-- ════════════════════════════════════════════════════════════════════════

-- ── Se van la dirección y el mapa ───────────────────────────────────────
--
-- La tienda no tiene local a la calle. Una dirección que nadie puede ir a
-- visitar y un mapa apuntando a una comuna no le resuelven nada a quien
-- entra a contactarse: le responden una pregunta que no hizo.
--
-- OJO, esto NO toca lo legal. El domicilio de la empresa vive en
-- `legal.domicilio` y se sigue publicando en los términos y en la política
-- de privacidad, que es donde la Ley 19.496 pide que esté identificado
-- quién vende. Esa fila no se toca acá y no hay que borrarla.
delete from public.site_settings
where key in ('contact.address', 'contact.maps_embed_url');

-- ── La columna se rearma ────────────────────────────────────────────────
--
-- En lugar de "dónde quedamos" —que no tiene respuesta útil— va lo que sí
-- se pregunta al entrar a contacto: por dónde escribir, a qué hora
-- contestan, y cómo llega lo que compre.
--
-- Los montos del despacho NO se guardan acá: salen de las reglas de envío
-- (Ajustes → Comercio), las mismas que cotiza el carrito. Subir el envío
-- gratis a $60.000 cambia esa línea sola, sin tocar este texto.
update public.page_sections
set
  content = (content - 'label_direccion' - 'map_caption')
    || jsonb_build_object(
      'label_canales', 'Escríbenos directo',
      'label_correo', 'Correo',
      'label_despacho', 'Despacho',
      'despacho_cobertura', 'Despacho a todo Chile',
      'despacho_retiro', 'Entrega a convenir dentro de Santiago'
    ),
  fields = (fields - 'label_direccion' - 'map_caption')
    || jsonb_build_object(
      'label_canales', jsonb_build_object('label', 'Rótulo — canales', 'kind', 'text'),
      'label_correo', jsonb_build_object('label', 'Rótulo — correo', 'kind', 'text'),
      'label_despacho', jsonb_build_object('label', 'Rótulo — despacho', 'kind', 'text'),
      'despacho_cobertura', jsonb_build_object(
        'label', 'Despacho — cobertura',
        'kind', 'text',
        'help', 'Primera línea del bloque. Ej: "Despacho a todo Chile".'
      ),
      'despacho_retiro', jsonb_build_object(
        'label', 'Despacho — retiro o entrega',
        'kind', 'text',
        'help', 'Tercera línea. ⚠️ Revisar que sea cierto antes de publicar: dice que hay entrega a convenir en Santiago.'
      )
    ),
  name = 'Cómo llegar a nosotros'
where page_id = (select id from public.pages where slug = 'contacto')
  and key = 'datos';
