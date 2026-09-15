-- ════════════════════════════════════════════════════════════════════════
-- 0005 — VARIAS FOTOS POR PRODUCTO
-- ════════════════════════════════════════════════════════════════════════
--
-- Correr en Supabase → SQL Editor, después de 0004. Es idempotente.
--
-- ⚠️ ORDEN: aplicar DESPUÉS de desplegar el código que lee product_images.
-- La foto principal se conserva en products.photo_url, así que un deploy
-- viejo sigue funcionando; pero el panel nuevo necesita esta tabla.
-- ════════════════════════════════════════════════════════════════════════

-- ── Galería ─────────────────────────────────────────────────────────────
--
-- Tabla aparte y no un arreglo de URLs en products, por dos motivos:
--
--   · Cada foto necesita su propia `storage_path` para poder borrarse del
--     bucket cuando se quita. Con un text[] habría que adivinar qué archivo
--     corresponde a qué URL.
--   · El orden es un dato del negocio —cuál se ve primero en el carrusel— y
--     merece una columna que se pueda cambiar sin reescribir el arreglo
--     completo.
--
-- products.photo_url SE QUEDA. Es la foto principal: la que sale en las
-- cards del catálogo, en el bento de la portada y en la miniatura del
-- panel. Moverla acá habría obligado a un JOIN en cada listado para mostrar
-- una imagen, y a decidir "cuál es la principal" en cada consulta.
create table if not exists public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   bigint not null references public.products(id) on delete cascade,
  url          text not null,
  storage_path text,
  alt          text not null default '',
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),

  constraint product_images_url_no_vacia check (btrim(url) <> '')
);

comment on table public.product_images is
  'Fotos ADICIONALES del producto. La principal vive en products.photo_url.';
comment on column public.product_images.storage_path is
  'Ruta dentro del bucket `media`. Permite borrar el archivo al quitar la foto. NULL si es una URL externa.';
comment on column public.product_images.alt is
  'Texto alternativo. Vacío = decorativa; el carrusel ya describe el producto por su nombre.';

-- on delete cascade ya limpia las filas, pero sin índice cada borrado de
-- producto recorre la tabla entera buscando sus fotos.
create index if not exists product_images_producto_idx
  on public.product_images (product_id, sort_order);

-- ── Permisos y RLS ──────────────────────────────────────────────────────
grant select on public.product_images to anon;
grant all on public.product_images to authenticated, service_role;

alter table public.product_images enable row level security;

-- Las fotos de un producto despublicado no se ven, igual que el producto.
-- Sin esta condición, alguien podría ir listando imágenes y adivinar qué
-- se está preparando para publicar.
drop policy if exists "fotos: las de productos publicados son públicas" on public.product_images;
create policy "fotos: las de productos publicados son públicas"
  on public.product_images for select
  using (exists (select 1 from public.products p where p.id = product_id and p.is_published));

drop policy if exists "fotos: escribe el admin" on public.product_images;
create policy "fotos: escribe el admin"
  on public.product_images for all
  using (public.is_admin()) with check (public.is_admin());

-- ── Verificación ────────────────────────────────────────────────────────
--   select p.slug, count(i.id) as fotos_extra
--     from public.products p
--     left join public.product_images i on i.product_id = p.id
--    group by p.slug order by 2 desc;
