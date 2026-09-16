-- ════════════════════════════════════════════════════════════════════════
-- 0006 — EL MAPA ACEPTA CUALQUIER ENLACE DE GOOGLE MAPS
-- ════════════════════════════════════════════════════════════════════════
--
-- Correr en Supabase → SQL Editor. Es idempotente.
--
-- ⚠️ ORDEN: aplicar DESPUÉS de desplegar el código. Esta migración cambia
-- SOLO el rótulo y la ayuda del campo —ni el valor guardado ni nada que el
-- sitio lea—, así que un deploy viejo no se entera. Al revés sí molesta:
-- la ayuda prometería algo que el código todavía no sabe hacer.
-- ════════════════════════════════════════════════════════════════════════

-- El campo pedía "la URL del embed" y explicaba el camino correcto:
-- Compartir → Insertar un mapa → copiar el src del iframe. Igual llegó lo
-- que da el botón Compartir a secas (maps.app.goo.gl/…), que Google se
-- niega a dejar incrustar. El resultado era un recuadro vacío, sin ningún
-- error que lo explicara.
--
-- El código ahora traduce solo las cinco formas que Google reparte, así que
-- el campo deja de exigir una en particular. Se le cambia el nombre además
-- de la ayuda: mientras se llame "URL del embed", quien lo llene va a creer
-- que se equivocó si pega otra cosa.
update public.site_settings
set
  label = 'Mapa (enlace de Google Maps)',
  help = 'Sirve cualquiera: el enlace de Compartir, el de la barra del navegador, el del botón "Insertar un mapa" o directamente la dirección escrita. Vacío = se muestra el rayado.'
where key = 'contact.maps_embed_url';

-- El pie del rayado solo se ve cuando NO hay nada cargado: si hay un enlace
-- que no se puede incrustar, la página muestra "Ver en Google Maps →" para
-- que el visitante llegue igual.
update public.page_sections
set fields = jsonb_set(
  fields,
  '{map_caption,help}',
  to_jsonb('Se ve solo si el campo Mapa de Ajustes → Contacto está vacío.'::text)
)
where page_id = (select id from public.pages where slug = 'contacto')
  and key = 'datos'
  and fields ? 'map_caption';
