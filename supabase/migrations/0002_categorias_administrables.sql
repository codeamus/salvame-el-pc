-- ════════════════════════════════════════════════════════════════════════
-- 0002 — CATEGORÍAS ADMINISTRABLES
-- ════════════════════════════════════════════════════════════════════════
--
-- Correr en Supabase → SQL Editor, sobre la base que ya tiene el schema
-- inicial aplicado. Es idempotente: se puede repetir sin romper nada.
--
-- QUÉ CAMBIA
--
-- Hasta ahora las categorías eran una lista cerrada en DOS lugares que había
-- que mantener sincronizados a mano: la union `CATEGORIES` de
-- src/types/product.ts y un CHECK en la tabla products. Agregar una
-- categoría era un deploy.
--
-- Ahora son filas de una tabla, y el CHECK se reemplaza por una CLAVE
-- FORÁNEA. El cambio de mecanismo importa:
--
--   · ON UPDATE CASCADE: renombrar "Mouse" a "Mouses" actualiza sola la
--     categoría de todos sus productos. Sin esto, renombrar dejaría
--     productos apuntando a una categoría inexistente.
--   · ON DELETE RESTRICT: no se puede borrar una categoría que tenga
--     productos. Es deliberado — la alternativa (borrar en cascada) haría
--     desaparecer el catálogo entero por un clic, y poner la categoría en
--     NULL dejaría productos huérfanos que ninguna página sabe mostrar.
--
-- LO QUE SE PIERDE, dicho claramente: la union cerrada de TypeScript hacía
-- que un typo en una categoría fallara al compilar. Con categorías
-- dinámicas eso ya no es posible, porque la lista solo se conoce en
-- runtime. La garantía no desaparece, cambia de lugar: ahora la da esta
-- clave foránea, que se cumple venga la escritura de donde venga.
-- ════════════════════════════════════════════════════════════════════════

-- ── La tabla ────────────────────────────────────────────────────────────
--
-- `name` es la clave primaria y no un id numérico, a propósito: es lo que
-- viaja en la URL del catálogo (/tienda?cat=Mouse), lo que guarda
-- products.category y lo que ve el comprador. Con un id habría que
-- arrastrar un JOIN a cada consulta del sitio para mostrar una palabra, y
-- la URL pasaría a ser /tienda?cat=3, que no le dice nada a nadie.
--
-- El costo de esa decisión —que renombrar mueva la clave— está cubierto por
-- el ON UPDATE CASCADE de la foránea.
create table if not exists public.categories (
  name        text primary key,
  sort_order  int not null default 0,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Un nombre vacío o con espacios de sobra rompería la URL y el filtro del
  -- catálogo, que compara por texto exacto.
  constraint categories_name_no_vacio check (name = btrim(name) and length(name) > 0)
);

comment on table public.categories is
  'Categorías del catálogo. Reemplaza a la union CATEGORIES de src/types/product.ts.';
comment on column public.categories.is_visible is
  'false = no aparece en los filtros ni en la portada. Sus productos publicados siguen siendo accesibles por su URL.';
comment on column public.categories.sort_order is
  'Orden en la portada y en los filtros. A igual valor, alfabético.';

drop trigger if exists set_updated_at on public.categories;
create trigger set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

-- ── Semilla: lo que YA existe en el catálogo ────────────────────────────
--
-- Sale de los productos y no de una lista escrita a mano: así la foránea de
-- más abajo no puede fallar por una categoría que exista en products y que
-- a alguien se le haya olvidado poner acá.
insert into public.categories (name, sort_order)
select p.category, (row_number() over (order by p.category)) * 10
from (select distinct category from public.products) as p
on conflict (name) do nothing;

-- Y las seis del handoff, por si la tabla de productos estuviera vacía.
insert into public.categories (name, sort_order) values
  ('Mouse', 10), ('Teclados', 20), ('RAM', 30),
  ('Audífonos', 40), ('Monitores', 50), ('GPU', 60)
on conflict (name) do nothing;

-- ── CHECK → clave foránea ───────────────────────────────────────────────
alter table public.products drop constraint if exists products_category_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_category_fkey'
  ) then
    alter table public.products
      add constraint products_category_fkey
      foreign key (category) references public.categories(name)
      on update cascade
      on delete restrict;
  end if;
end
$$;

-- La foránea no crea índice sola. Sin él, cada borrado de categoría hace un
-- recorrido completo de products para comprobar el RESTRICT.
create index if not exists products_category_fk_idx on public.products (category);

-- ── Permisos de tabla ───────────────────────────────────────────────────
--
-- Explícitos y no heredados de los `default privileges` del proyecto.
--
-- Supabase los configura para que una tabla nueva en `public` quede
-- accesible sola, pero eso es una preferencia del proyecto que alguien pudo
-- haber cambiado. Si faltaran, el sitio dejaría de ver las categorías con un
-- "permission denied" que NO parece un problema de permisos: parece que la
-- tienda se quedó sin filtros.
--
-- Conceder no es abrir: RLS sigue decidiendo qué filas ve cada quien.
grant select on public.categories to anon;
grant all on public.categories to authenticated, service_role;

-- ── Row Level Security ──────────────────────────────────────────────────
alter table public.categories enable row level security;

-- Lectura pública de las visibles: es lo que arma los filtros del catálogo
-- y los tiles de la portada.
drop policy if exists "categorías: lectura de visibles" on public.categories;
create policy "categorías: lectura de visibles"
  on public.categories for select using (is_visible);

drop policy if exists "categorías: escribe el admin" on public.categories;
create policy "categorías: escribe el admin"
  on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

-- ── Verificación ────────────────────────────────────────────────────────
--   select name, sort_order, is_visible from public.categories order by sort_order;
--   select category, count(*) from public.products group by category order by 1;
