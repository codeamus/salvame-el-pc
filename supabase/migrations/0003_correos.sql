-- ════════════════════════════════════════════════════════════════════════
-- 0003 — CORREOS: mensajes de contacto y confirmación de pedido
-- ════════════════════════════════════════════════════════════════════════
--
-- Correr en Supabase → SQL Editor, después de 0002. Es idempotente.
--
-- Cubre dos huecos que tenían la misma raíz —el sitio no sabía mandar
-- correos— pero consecuencias muy distintas:
--
--   · El formulario de contacto mostraba "mensaje enviado" sin enviar nada.
--   · Una compra se cobraba sin que el comprador recibiera comprobante. La
--     Ley 19.496 obliga a enviar confirmación ESCRITA de la compra, y no
--     hacerlo extiende el derecho a retracto de 10 a 90 días corridos.
-- ════════════════════════════════════════════════════════════════════════

-- ── Mensajes del formulario de contacto ─────────────────────────────────
--
-- Se guardan ADEMÁS de enviarse por correo, y ese "además" es el punto: un
-- aviso que cae en spam, que alguien borra sin querer o que falla porque el
-- proveedor tuvo un mal día es un cliente perdido sin rastro. En la base, el
-- mensaje sigue ahí.
create table if not exists public.contact_messages (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  correo       text not null,
  asunto       text not null default '',
  mensaje      text not null,

  -- Se marca cuando el admin lo abre en el panel, para separar lo nuevo de
  -- lo ya visto sin tener que borrar nada.
  leido        boolean not null default false,

  -- Si el aviso por correo salió o no. Un mensaje guardado pero sin avisar
  -- es justamente el que hay que mirar: nadie se enteró de que llegó.
  aviso_enviado_at timestamptz,

  created_at   timestamptz not null default now(),

  constraint contact_messages_no_vacio
    check (btrim(nombre) <> '' and btrim(correo) <> '' and btrim(mensaje) <> '')
);

comment on table public.contact_messages is
  'Mensajes del formulario de contacto. Se guardan aunque el aviso por correo falle.';
comment on column public.contact_messages.aviso_enviado_at is
  'Cuándo se avisó por correo. NULL = llegó pero nadie fue notificado.';

create index if not exists contact_messages_nuevos_idx
  on public.contact_messages (created_at desc) where not leido;

drop trigger if exists set_updated_at on public.contact_messages;

-- ── Confirmación de compra enviada ──────────────────────────────────────
--
-- Nullable a propósito: NULL significa "todavía no se avisó", y es lo que
-- permite reintentar desde el panel. Sin esta columna, un correo que no sale
-- —Resend caído, una casilla mal escrita— se pierde en silencio y nadie
-- puede saber a qué compradores les falta su comprobante. Con el plazo de
-- retracto de por medio, eso no es un detalle operativo.
alter table public.orders
  add column if not exists confirmation_sent_at timestamptz;

comment on column public.orders.confirmation_sent_at is
  'Cuándo se envió la confirmación escrita al comprador. NULL = pendiente. La Ley 19.496 la exige: sin ella el retracto pasa de 10 a 90 días.';

create index if not exists orders_sin_confirmar_idx
  on public.orders (created_at desc)
  where status = 'completed' and confirmation_sent_at is null;

-- ── Permisos y RLS ──────────────────────────────────────────────────────
--
-- contact_messages NO tiene política para anon, ni de lectura ni de
-- escritura. El formulario público no escribe en la tabla: postea a
-- /api/contacto, que valida y guarda con la service role.
--
-- Dejar que anon insertara habría sido más simple y habría convertido la
-- tabla en un buzón abierto a internet, sin validación ni límite.
grant select, update on public.contact_messages to authenticated;
grant all on public.contact_messages to service_role;

alter table public.contact_messages enable row level security;

drop policy if exists "mensajes: los lee el admin" on public.contact_messages;
create policy "mensajes: los lee el admin"
  on public.contact_messages for select using (public.is_admin());

drop policy if exists "mensajes: el admin los marca leídos" on public.contact_messages;
create policy "mensajes: el admin los marca leídos"
  on public.contact_messages for update
  using (public.is_admin()) with check (public.is_admin());

-- ── Verificación ────────────────────────────────────────────────────────
--   select count(*) from public.contact_messages;
--   select reference, confirmation_sent_at from public.orders
--     where status = 'completed' order by created_at desc;
