-- ════════════════════════════════════════════════════════════════════════
-- 0004 — REDES SOCIALES
-- ════════════════════════════════════════════════════════════════════════
--
-- Correr en Supabase → SQL Editor, después de 0003. Es idempotente.
--
-- ⚠️ ORDEN: esta migración BORRA contact.instagram_url y
-- contact.instagram_handle, que el footer usaba antes de leer la lista. Hay
-- que aplicarla DESPUÉS de desplegar el código que lee contact.redes.
--
-- Al revés, el sitio queda un rato con el enlace de Instagram apuntando a
-- "#". Pasó mientras se preparaba este cambio: se borraron los ajustes con
-- el deploy viejo todavía arriba, y el footer perdió el enlace en vivo.
--
-- Hasta ahora las redes eran dos ajustes sueltos —contact.instagram_url y
-- contact.instagram_handle— y el footer las tenía escritas una por una. Con
-- eso, agregar TikTok significaba tocar el footer, la página de contacto y
-- hacer un deploy.
--
-- Pasan a ser UNA lista. Sumar una red mañana es editar un JSON desde el
-- panel; el sitio la dibuja sola.
-- ════════════════════════════════════════════════════════════════════════

-- ── La lista ────────────────────────────────────────────────────────────
--
-- WhatsApp NO entra acá y eso es deliberado: no es una red que se sigue,
-- es el canal por el que se pide hora al taller. Tiene su propio botón
-- destacado en servicio técnico y su propio ajuste, porque cambiarlo de
-- lugar sería enterrarlo entre iconos.
insert into public.site_settings (key, value, label, help, kind, group_key, sort_order)
values (
  'contact.redes',
  '[
    {"label": "Instagram", "href": "https://www.instagram.com/salvameelpc/"},
    {"label": "TikTok", "href": "https://www.tiktok.com/@salvameelpc"},
    {"label": "Facebook", "href": "https://www.facebook.com/profile.php?id=61572013955231"}
  ]'::jsonb,
  'Redes sociales',
  'Se muestran en el footer y en la página de contacto, en este orden. Para agregar una red, copia un bloque y cambia el nombre y el enlace.',
  'json',
  'contacto',
  35
)
on conflict (key) do nothing;

-- ── Enlaces reales, reemplazando los placeholders del handoff ───────────
--
-- Solo se tocan si SIGUEN siendo el placeholder. Si alguien ya los corrigió
-- desde el panel, su valor manda: una migración no puede pisar una edición
-- deliberada solo porque llegó después.
update public.site_settings
set value = to_jsonb('https://wa.me/message/SBSIGWETUNYRI1'::text)
where key = 'contact.whatsapp_url'
  and value #>> '{}' = 'https://wa.me/56900000000';

update public.site_settings
set value = to_jsonb('https://www.instagram.com/salvameelpc/'::text)
where key = 'contact.instagram_url'
  and value #>> '{}' = 'https://instagram.com';

-- El número que se muestra en el footer y en el botón de servicio técnico.
-- No se puede deducir del enlace: wa.me/message/… es un enlace corto de
-- "click to chat" y no lleva el número dentro.
update public.site_settings
set value = to_jsonb('+56 9 9067 6619'::text)
where key = 'contact.whatsapp_display'
  and value #>> '{}' = '+56 9 0000 0000';

-- ── Los que ya no se usan ───────────────────────────────────────────────
--
-- Instagram dejó de tener ajustes propios: vive en la lista. Se borran para
-- que el panel no muestre campos que no afectan a nada — un ajuste que se
-- edita y no cambia nada es peor que no tenerlo.
delete from public.site_settings where key in ('contact.instagram_url', 'contact.instagram_handle');

-- ── Verificación ────────────────────────────────────────────────────────
--   select key, value from public.site_settings
--    where group_key = 'contacto' order by sort_order;
