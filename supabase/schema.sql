-- ════════════════════════════════════════════════════════════════════════
-- SÁLVAME EL PC — schema completo (CMS + catálogo + pedidos)
-- ════════════════════════════════════════════════════════════════════════
--
-- CÓMO CORRERLO
--   Supabase → SQL Editor → New query → pegar este archivo entero → Run.
--
-- Es idempotente: se puede volver a correr sin romper nada. Las tablas usan
-- `if not exists`, las políticas se recrean y los seeds llevan
-- `on conflict do nothing` (no pisan lo que ya editaste desde el panel).
--
-- ANTES DE USARLO, EN EL DASHBOARD:
--   1. Authentication → Providers → Email: dejar habilitado.
--   2. Authentication → Sign In / Providers → DESACTIVAR "Allow new users to
--      sign up". Sin esto, cualquiera se registra y —según el modelo de
--      permisos de más abajo— queda con acceso de administrador.
--   3. Authentication → Users → Add user: crear el único usuario admin con
--      su correo y contraseña, y marcar "Auto Confirm User".
--
-- MODELO DE PERMISOS (decisión: un solo usuario admin)
--   • anon key (navegador, build, ISR): SOLO lectura de contenido publicado.
--   • usuario autenticado: es el admin. Escribe todo el contenido.
--   • service role key (solo servidor, /api/**): pasa por encima de RLS.
--     Es la única que toca pedidos y stock. JAMÁS va al navegador.
--
--   Si mañana entra un segundo usuario que NO deba ser admin, lo único que
--   hay que cambiar es la función public.is_admin() — ninguna política.
--
-- CONTRATOS QUE ESTE SCHEMA RESPETA (no inventar columnas nuevas sin mirar):
--   • src/types/product.ts      → tabla products
--   • src/lib/orders/store.ts   → tabla orders (reference, status, quote,
--                                 customer, last_notification)
--   • src/lib/orders/quote.ts   → jsonb `quote` y tabla order_items
--   • src/config/site.ts        → tabla site_settings
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;


-- ════════════════════════════════════════════════════════════════════════
-- 1. HELPERS
-- ════════════════════════════════════════════════════════════════════════

-- Mantiene updated_at sin que la app tenga que acordarse nunca.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

/*
 * ¿Quién puede escribir?
 *
 * Hoy: cualquier sesión autenticada, porque el proyecto tiene un solo
 * usuario y el registro público está cerrado. Está aislada en una función
 * —y no repetida en 20 políticas— justamente para que agregar roles después
 * sea editar estas tres líneas y nada más. Por ejemplo:
 *
 *   select coalesce(
 *     (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
 *
 * El `select` envolviendo a auth.uid() no es adorno: hace que Postgres
 * evalúe la llamada UNA vez por query en vez de una vez por fila.
 */
create or replace function public.is_admin()
returns boolean
language sql
stable
as $fn$
  select (select auth.uid()) is not null;
$fn$;


-- ════════════════════════════════════════════════════════════════════════
-- 2. CONTENIDO — ajustes globales del sitio
-- ════════════════════════════════════════════════════════════════════════

/*
 * Reemplaza a las constantes SITE, CONTACT, LEGAL, PROMO_TEXT de
 * src/config/site.ts y a las reglas de envío de src/lib/order-rules.ts.
 *
 * Es clave→valor y no una fila con 30 columnas porque el panel dibuja el
 * formulario SOLO: `kind` le dice qué input usar, `label` qué rotular y
 * `group_key` en qué pestaña agruparlo. Agregar un ajuste nuevo mañana es
 * un INSERT, no un deploy.
 */
create table if not exists public.site_settings (
  key         text primary key,
  value       jsonb not null,
  label       text not null,
  help        text,
  kind        text not null default 'text'
              check (kind in ('text','textarea','url','email','phone','number','boolean','image','list','json')),
  group_key   text not null,
  sort_order  int  not null default 0,
  updated_at  timestamptz not null default now()
);

comment on table public.site_settings is
  'Ajustes globales editables. Espeja src/config/site.ts y src/lib/order-rules.ts.';
comment on column public.site_settings.value is
  'Siempre JSON: "texto" para strings, 3990 para números, ["a","b"] para listas.';


-- ════════════════════════════════════════════════════════════════════════
-- 3. CONTENIDO — páginas y secciones
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.pages (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  route           text not null,
  seo_title       text,
  seo_description text,
  is_published    boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column public.pages.slug is
  'Identificador estable que usa el front para pedir la página. NO cambiarlo: es la clave del código.';
comment on column public.pages.route is
  'Ruta real en el sitio. Informativa para el panel (el routing lo define Astro).';

/*
 * Una sección = un bloque visual de la página (el hero, la grilla de
 * ofertas, el CTA de WhatsApp).
 *
 * `content` es jsonb libre y `fields` describe cómo editarlo. Ese par es lo
 * que hace que el panel sea UN solo formulario genérico para todo el sitio
 * en vez de una pantalla escrita a mano por página: el editor lee `fields`,
 * dibuja los inputs y guarda en `content`.
 *
 * Forma de `fields`:
 *   {"heading": {"label": "Título", "kind": "text"},
 *    "items":   {"label": "Servicios", "kind": "list",
 *                "of": {"title": {"label":"Título","kind":"text"}}}}
 */
create table if not exists public.page_sections (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null references public.pages(id) on delete cascade,
  key         text not null,
  name        text not null,
  content     jsonb not null default '{}'::jsonb,
  fields      jsonb not null default '{}'::jsonb,
  is_visible  boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (page_id, key)
);

comment on column public.page_sections.key is
  'Clave que busca el componente Astro. NO cambiarla desde el panel: rompe la página.';
comment on column public.page_sections.fields is
  'Descriptor del formulario. Lo lee el panel para dibujar los inputs de `content`.';

create index if not exists page_sections_page_idx
  on public.page_sections (page_id, sort_order);


-- ════════════════════════════════════════════════════════════════════════
-- 4. CONTENIDO — documentos legales
-- ════════════════════════════════════════════════════════════════════════

/*
 * Términos y condiciones + política de privacidad.
 *
 * Van en su propio par de tablas y no como secciones porque tienen una
 * exigencia que ninguna otra página tiene: los `anchor` son enlaces
 * permanentes (el footer apunta a #despacho) y `content_updated_on` tiene
 * que cambiar cuando cambia EL TEXTO, no cuando se recompila el sitio.
 * Un documento legal que dice "actualizado hoy" en cada build deja de ser
 * trazable ante un reclamo.
 */
create table if not exists public.legal_documents (
  id                 uuid primary key default gen_random_uuid(),
  slug               text unique not null,
  title              text not null,
  intro              text not null default '',
  seo_description    text,
  content_updated_on date not null default current_date,
  is_published       boolean not null default true,
  sort_order         int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.legal_sections (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.legal_documents(id) on delete cascade,
  anchor      text not null,
  title       text not null,
  body_html   text not null default '',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (document_id, anchor)
);

comment on column public.legal_sections.anchor is
  'id del <h2>. Es un enlace permanente (footer → #despacho): cambiarlo rompe enlaces vivos.';
comment on column public.legal_sections.body_html is
  'HTML acotado (p, ul, ol, li, strong, em, a). Admite {{placeholders}} de site_settings.';

create index if not exists legal_sections_doc_idx
  on public.legal_sections (document_id, sort_order);


-- ════════════════════════════════════════════════════════════════════════
-- 5. CATÁLOGO — productos
-- ════════════════════════════════════════════════════════════════════════

/*
 * Espeja src/types/product.ts columna por columna.
 *
 * El id es bigint y NO uuid a propósito: Product.id es `number`, el carrito
 * guarda ids en el localStorage del visitante y /api/checkout recotiza con
 * esos ids. Cambiarlos a uuid vaciaría todos los carritos abiertos y
 * obligaría a tocar el store, la cotización y el checkout. El id numérico
 * es parte del contrato público, no un detalle de la base.
 *
 * `generated by default` (y no `always`) es lo que permite sembrar los 12
 * productos del handoff conservando sus ids actuales.
 */
create table if not exists public.products (
  id                     bigint generated by default as identity primary key,
  slug                   text unique not null,
  name                   text not null,
  brand                  text not null,
  category               text not null,
  price_clp              int  not null check (price_clp >= 0),
  compare_at_price_clp   int  check (compare_at_price_clp >= 0),
  is_featured            boolean not null default false,
  photo_url              text not null default '',
  photo_path             text,
  photo_caption          text,
  specs                  text[] not null default '{}',
  stock                  int not null default 0 check (stock >= 0),
  track_stock            boolean not null default true,
  is_published           boolean not null default true,
  sort_order             int not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- Las 6 categorías de CATEGORIES en src/types/product.ts. Es una union
  -- cerrada en TypeScript, así que la base la refleja tal cual: agregar una
  -- categoría es tocar LOS DOS lados (el `as const` y este check).
  constraint products_category_check check (
    category in ('Mouse','Teclados','RAM','Audífonos','Monitores','GPU')
  ),

  -- getDiscountPercent() ignora un compareAt <= price, así que un precio
  -- "antes" menor o igual al actual es un dato roto que se vería como un
  -- producto sin descuento. Se rechaza al guardar, no al renderizar.
  constraint products_compare_at_gt_price check (
    compare_at_price_clp is null or compare_at_price_clp > price_clp
  )
);

comment on column public.products.photo_path is
  'Ruta del archivo dentro del bucket `media`. Se guarda para poder borrar la imagen al reemplazarla.';
comment on column public.products.photo_caption is
  'Caption del placeholder rayado. Si va en null, el front usa "[ foto: <nombre> ]".';
comment on column public.products.track_stock is
  'false = se vende sin descontar stock (pedido por encargo). El panel muestra "sin control de stock".';
comment on column public.products.sort_order is
  'Orden manual en tienda y destacados. A igual valor, desempata por id.';

create index if not exists products_published_idx
  on public.products (is_published, sort_order, id);
create index if not exists products_category_idx
  on public.products (category) where is_published;
create index if not exists products_featured_idx
  on public.products (is_featured) where is_published and is_featured;


-- ════════════════════════════════════════════════════════════════════════
-- 6. COMERCIO — pedidos, líneas y movimientos de stock
-- ════════════════════════════════════════════════════════════════════════

-- Estado del PAGO. Espeja OrderStatus de src/lib/orders/store.ts.
do $enum$
begin
  if not exists (select 1 from pg_type where typname = 'order_payment_status') then
    create type public.order_payment_status as enum ('pending','completed','failed');
  end if;
end
$enum$;

-- Estado de la LOGÍSTICA. Lo mueve el admin a mano.
do $enum$
begin
  if not exists (select 1 from pg_type where typname = 'order_fulfillment_status') then
    create type public.order_fulfillment_status as enum
      ('nuevo','preparando','enviado','entregado','retirado','cancelado');
  end if;
end
$enum$;

/*
 * Reemplaza al Map en memoria de src/lib/orders/store.ts.
 *
 * Ese store no era un atajo perezoso: era un bug conocido y documentado. En
 * Vercel cada invocación puede correr en otra instancia, así que el callback
 * de TUU podía llegar a un proceso que nunca vio la orden y la página de
 * éxito preguntarle a un tercero. Con esta tabla las tres rutas hablan del
 * mismo dato.
 *
 * DOS estados separados y no uno solo, que es el error clásico:
 *   status             lo escribe el callback de TUU. Es plata.
 *   fulfillment_status lo escribe el admin. Es logística.
 * Si fueran la misma columna, marcar "enviado" desde el panel sacaría a la
 * orden de 'completed' y el próximo reintento del callback —TUU reintenta
 * hasta 10 veces— la volvería a procesar como si recién se hubiera pagado.
 */
create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  reference          text unique not null,
  status             public.order_payment_status not null default 'pending',
  fulfillment_status public.order_fulfillment_status not null default 'nuevo',
  amount_clp         int not null check (amount_clp >= 0),
  quote              jsonb not null,
  customer           jsonb not null,
  last_notification  jsonb,
  tuu_payment_id     text,
  admin_notes        text,
  stock_applied      boolean not null default false,
  needs_review       boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column public.orders.reference is
  'ORD-AAAAMMDD-XXXXXXXX. Clave con la que casa el callback de TUU: el índice único es lo que impide marcar la orden equivocada como pagada.';
comment on column public.orders.quote is
  'Quote del servidor (src/lib/orders/quote.ts) tal cual se firmó. Es la prueba de qué se cobró.';
comment on column public.orders.customer is
  'CheckoutPayload completo, incluidos RUT y dirección, que TUU no recibe.';
comment on column public.orders.last_notification is
  'Último callback recibido, crudo. Es con lo que se concilia contra el panel de TUU.';
comment on column public.orders.stock_applied is
  'true = a esta orden ya se le descontó stock. Es el seguro anti doble descuento ante reintentos.';
comment on column public.orders.needs_review is
  'true = se pagó pero el stock no alcanzaba. Se cobró igual; hay que resolverlo a mano.';

create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_status_idx  on public.orders (status, fulfillment_status);

/*
 * Las líneas ya viven dentro de `quote`, pero duplicarlas normalizadas es
 * deliberado: sin esto no se puede descontar stock en SQL, ni preguntar
 * "cuánto vendí de este producto", ni listar los pedidos de un producto.
 *
 * slug y name son SNAPSHOT, no adorno. El panel puede borrar o renombrar un
 * producto; un pedido histórico tiene que seguir diciendo qué se vendió y a
 * qué precio. Por eso product_id es `on delete set null` y el nombre se
 * copia al momento de la venta.
 */
create table if not exists public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  product_id     bigint references public.products(id) on delete set null,
  slug           text not null,
  name           text not null,
  quantity       int not null check (quantity > 0),
  unit_price_clp int not null check (unit_price_clp >= 0),
  line_total_clp int not null check (line_total_clp >= 0),
  created_at     timestamptz not null default now()
);

create index if not exists order_items_order_idx   on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);

-- Auditoría de stock: toda variación queda con su motivo. Sin esto, un
-- descuadre no se puede explicar nunca.
create table if not exists public.stock_movements (
  id         uuid primary key default gen_random_uuid(),
  product_id bigint not null references public.products(id) on delete cascade,
  order_id   uuid references public.orders(id) on delete set null,
  delta      int not null,
  reason     text not null check (reason in ('venta','devolucion','reposicion','ajuste','inicial')),
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_product_idx
  on public.stock_movements (product_id, created_at desc);


-- ════════════════════════════════════════════════════════════════════════
-- 7. FUNCIONES TRANSACCIONALES
-- ════════════════════════════════════════════════════════════════════════

/*
 * Crea la orden y sus líneas en una sola transacción.
 *
 * La llama /api/checkout con la service role key, ANTES de mandar al
 * comprador a la pasarela. Si el insert de una línea falla, no queda una
 * orden a medias: o está completa o no está.
 *
 * Las líneas salen del `quote` firmado, no de parámetros sueltos: así es
 * imposible que order_items diga una cosa y el monto cobrado otra.
 */
create or replace function public.place_order(
  p_reference  text,
  p_amount_clp int,
  p_quote      jsonb,
  p_customer   jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_order_id uuid;
begin
  insert into public.orders (reference, amount_clp, quote, customer)
  values (p_reference, p_amount_clp, p_quote, p_customer)
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, slug, name, quantity, unit_price_clp, line_total_clp)
  select v_order_id, line."productId", line.slug, line.name,
         line.quantity, line."unitPriceCLP", line."lineTotalCLP"
  from jsonb_to_recordset(p_quote -> 'lines') as line(
    "productId"    bigint,
    slug           text,
    name           text,
    quantity       int,
    "unitPriceCLP" int,
    "lineTotalCLP" int
  );

  return v_order_id;
end;
$fn$;

/*
 * Cierra el pago y descuenta stock. Idempotente A PROPÓSITO.
 *
 * Devuelve `changed`, con el mismo contrato que markOrderResult() del store
 * en memoria, así que el callback no cambia de forma.
 *
 * TUU reintenta la notificación hasta 10 veces con backoff exponencial: la
 * misma llamada VA a llegar repetida. Una orden que ya está en estado final
 * no se vuelve a tocar — sin eso, un reintento tardío descontaría el stock
 * dos veces o pisaría un 'completed'.
 *
 * El `for update` bloquea la fila: si dos reintentos entran a la vez, el
 * segundo espera y al leer encuentra la orden ya cerrada. Sin el lock, los
 * dos leerían 'pending' y los dos descontarían.
 *
 * ⚠️ DECISIÓN: si al momento de pagar el stock no alcanza, NO se aborta.
 * La plata ya se cobró; reventar acá dejaría la orden colgada en 'pending'
 * y al comprador con el cargo hecho. Se descuenta hasta donde haya, se
 * marca needs_review y el panel lo muestra en rojo para resolverlo a mano.
 * La solución de fondo es reservar stock al crear la orden, no al pagarla.
 */
create or replace function public.settle_order(
  p_reference    text,
  p_status       public.order_payment_status,
  p_notification jsonb default null,
  p_payment_id   text  default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_order   public.orders%rowtype;
  v_item    record;
  v_taken   int;
  v_short   boolean := false;
begin
  -- Esta función escribe sus propios stock_movements con reason 'venta'.
  -- La bandera le dice al trigger de auditoría que no duplique el registro.
  -- `true` = local a la transacción: se limpia sola al terminar.
  perform set_config('app.stock_accounted', 'on', true);

  if p_status = 'pending' then
    raise exception 'settle_order solo cierra una orden: usa completed o failed';
  end if;

  select * into v_order
  from public.orders
  where reference = p_reference
  for update;

  if not found then
    return false;                      -- referencia desconocida
  end if;

  if v_order.status <> 'pending' then
    return false;                      -- ya cerrada: reintento de TUU
  end if;

  if p_status = 'completed' and not v_order.stock_applied then
    for v_item in
      select oi.product_id, oi.quantity
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      where oi.order_id = v_order.id
        and p.track_stock
      for update of p
    loop
      -- least() en vez de un check: nunca deja el stock negativo, y si tuvo
      -- que recortar es porque se vendió más de lo que había.
      select least(v_item.quantity, p.stock) into v_taken
      from public.products p
      where p.id = v_item.product_id;

      if v_taken < v_item.quantity then
        v_short := true;
      end if;

      if v_taken > 0 then
        update public.products
        set stock = stock - v_taken
        where id = v_item.product_id;

        insert into public.stock_movements (product_id, order_id, delta, reason, note)
        values (v_item.product_id, v_order.id, -v_taken, 'venta', p_reference);
      end if;
    end loop;
  end if;

  update public.orders
  set status            = p_status,
      last_notification = coalesce(p_notification, last_notification),
      tuu_payment_id    = coalesce(p_payment_id, tuu_payment_id),
      stock_applied     = stock_applied or (p_status = 'completed'),
      needs_review      = needs_review or v_short
  where id = v_order.id;

  return true;
end;
$fn$;

/*
 * Ajuste manual de stock desde el panel (reposición, merma, devolución).
 *
 * Es la vía limpia: deja el movimiento con su motivo real. Editar
 * products.stock directo desde el panel TAMBIÉN queda auditado, pero como
 * un 'ajuste' genérico — el trigger de la sección 9 se encarga de que no
 * exista forma de mover stock sin dejar rastro.
 */
create or replace function public.adjust_stock(
  p_product_id bigint,
  p_delta      int,
  p_reason     text default 'ajuste',
  p_note       text default null
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_stock int;
begin
  if not public.is_admin() then
    raise exception 'no autorizado';
  end if;

  -- Registra el movimiento con su motivo real más abajo; el trigger no debe
  -- volver a anotarlo como 'ajuste' genérico.
  perform set_config('app.stock_accounted', 'on', true);

  if p_reason not in ('devolucion','reposicion','ajuste','inicial') then
    raise exception 'motivo inválido: %', p_reason;
  end if;

  update public.products
  set stock = greatest(stock + p_delta, 0)
  where id = p_product_id
  returning stock into v_stock;

  if not found then
    raise exception 'producto % no existe', p_product_id;
  end if;

  insert into public.stock_movements (product_id, delta, reason, note)
  values (p_product_id, p_delta, p_reason, p_note);

  return v_stock;
end;
$fn$;

/*
 * Quién puede llamar a qué.
 *
 * Postgres le da EXECUTE a `public` por defecto, y PostgREST expone toda
 * función de public como endpoint RPC. Sin estos REVOKE, cualquiera con la
 * anon key —que viaja en el navegador— podría hacer POST /rpc/settle_order
 * y marcar sus propios pedidos como pagados. Es la línea más importante del
 * archivo.
 */
revoke all on function public.place_order(text, int, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.settle_order(text, public.order_payment_status, jsonb, text) from public, anon, authenticated;
revoke all on function public.adjust_stock(bigint, int, text, text) from public, anon;

grant execute on function public.place_order(text, int, jsonb, jsonb) to service_role;
grant execute on function public.settle_order(text, public.order_payment_status, jsonb, text) to service_role;
grant execute on function public.adjust_stock(bigint, int, text, text) to authenticated, service_role;


-- ════════════════════════════════════════════════════════════════════════
-- 8. TRIGGERS de updated_at
-- ════════════════════════════════════════════════════════════════════════

do $triggers$
declare
  t text;
begin
  foreach t in array array[
    'site_settings','pages','page_sections','legal_documents',
    'legal_sections','products','orders'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end
$triggers$;


-- ════════════════════════════════════════════════════════════════════════
-- 9. TRIGGER — ningún cambio de stock sin auditoría
-- ════════════════════════════════════════════════════════════════════════

/*
 * RLS decide QUÉ FILAS se pueden tocar, no qué columnas: no hay forma de
 * decir "puedes editar el producto pero no su stock". Así que en vez de
 * prohibir, se audita — un trigger anota cualquier variación que no venga
 * ya contabilizada por settle_order() o adjust_stock().
 *
 * El resultado es la garantía que importa: la suma de stock_movements de un
 * producto siempre explica su stock actual, sin importar quién lo movió ni
 * desde dónde.
 */
create or replace function public.audit_stock_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.stock is not distinct from old.stock then
    return null;
  end if;

  -- Ya lo anotó quien nos llamó (venta, devolución, reposición).
  if coalesce(current_setting('app.stock_accounted', true), '') = 'on' then
    return null;
  end if;

  insert into public.stock_movements (product_id, delta, reason, note)
  values (new.id, new.stock - old.stock, 'ajuste', 'edición directa del stock');

  return null;
end;
$fn$;

drop trigger if exists audit_stock_change on public.products;
create trigger audit_stock_change
  after update of stock on public.products
  for each row execute function public.audit_stock_change();


-- ════════════════════════════════════════════════════════════════════════
-- 10. ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════════
--
-- Regla de oro del archivo: RLS activado en TODAS las tablas. Una tabla de
-- public sin RLS queda expuesta entera a través de la anon key, que viaja
-- en el navegador de cualquier visitante.
--
-- Lectura pública = solo contenido publicado. Eso no es solo privacidad: es
-- lo que hace que un borrador siga siendo un borrador aunque alguien
-- adivine su slug.

alter table public.site_settings    enable row level security;
alter table public.pages            enable row level security;
alter table public.page_sections    enable row level security;
alter table public.legal_documents  enable row level security;
alter table public.legal_sections   enable row level security;
alter table public.products         enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.stock_movements  enable row level security;

-- ── Ajustes del sitio ───────────────────────────────────────────────────
drop policy if exists "ajustes: lectura pública" on public.site_settings;
create policy "ajustes: lectura pública"
  on public.site_settings for select using (true);

drop policy if exists "ajustes: escribe el admin" on public.site_settings;
create policy "ajustes: escribe el admin"
  on public.site_settings for all
  using (public.is_admin()) with check (public.is_admin());

-- ── Páginas ─────────────────────────────────────────────────────────────
drop policy if exists "páginas: lectura de publicadas" on public.pages;
create policy "páginas: lectura de publicadas"
  on public.pages for select using (is_published);

drop policy if exists "páginas: escribe el admin" on public.pages;
create policy "páginas: escribe el admin"
  on public.pages for all
  using (public.is_admin()) with check (public.is_admin());

-- Una sección visible de una página despublicada NO es pública: el estado
-- de la página manda sobre el de sus bloques.
drop policy if exists "secciones: lectura de visibles" on public.page_sections;
create policy "secciones: lectura de visibles"
  on public.page_sections for select
  using (
    is_visible
    and exists (select 1 from public.pages p where p.id = page_id and p.is_published)
  );

drop policy if exists "secciones: escribe el admin" on public.page_sections;
create policy "secciones: escribe el admin"
  on public.page_sections for all
  using (public.is_admin()) with check (public.is_admin());

-- ── Legales ─────────────────────────────────────────────────────────────
drop policy if exists "legales: lectura de publicados" on public.legal_documents;
create policy "legales: lectura de publicados"
  on public.legal_documents for select using (is_published);

drop policy if exists "legales: escribe el admin" on public.legal_documents;
create policy "legales: escribe el admin"
  on public.legal_documents for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "secciones legales: lectura de publicadas" on public.legal_sections;
create policy "secciones legales: lectura de publicadas"
  on public.legal_sections for select
  using (
    exists (select 1 from public.legal_documents d where d.id = document_id and d.is_published)
  );

drop policy if exists "secciones legales: escribe el admin" on public.legal_sections;
create policy "secciones legales: escribe el admin"
  on public.legal_sections for all
  using (public.is_admin()) with check (public.is_admin());

-- ── Productos ───────────────────────────────────────────────────────────
drop policy if exists "productos: lectura de publicados" on public.products;
create policy "productos: lectura de publicados"
  on public.products for select using (is_published);

drop policy if exists "productos: escribe el admin" on public.products;
create policy "productos: escribe el admin"
  on public.products for all
  using (public.is_admin()) with check (public.is_admin());

-- ── Pedidos ─────────────────────────────────────────────────────────────
--
-- Ni una sola política para anon. Un pedido lleva nombre, RUT, correo,
-- teléfono y dirección: es exactamente el dato que la Ley 19.628 obliga a
-- proteger, y publicarlo por la anon key sería una filtración con nombre y
-- apellido. El sitio consulta el estado de un pedido por
-- /api/orders/[reference], que corre en el servidor con la service role key
-- y devuelve solo lo que la página de éxito necesita mostrar.
drop policy if exists "pedidos: lee el admin" on public.orders;
create policy "pedidos: lee el admin"
  on public.orders for select using (public.is_admin());

-- El admin gestiona logística y notas. Crear y cerrar pedidos es trabajo de
-- las funciones con service role: no hay INSERT ni DELETE para nadie más.
drop policy if exists "pedidos: el admin gestiona" on public.orders;
create policy "pedidos: el admin gestiona"
  on public.orders for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "líneas: lee el admin" on public.order_items;
create policy "líneas: lee el admin"
  on public.order_items for select using (public.is_admin());

drop policy if exists "movimientos: lee el admin" on public.stock_movements;
create policy "movimientos: lee el admin"
  on public.stock_movements for select using (public.is_admin());


-- ════════════════════════════════════════════════════════════════════════
-- 11. STORAGE — bucket de imágenes
-- ════════════════════════════════════════════════════════════════════════
--
-- Bucket público: las fotos de productos se sirven directo desde el CDN de
-- Supabase, sin URL firmada ni proxy. Lo público es LEER; subir y borrar
-- sigue siendo solo del admin.
--
-- Convención de rutas: productos/<slug>-<timestamp>.<ext>, sitio/<nombre>.

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

/*
 * Las políticas de storage.objects se crean dentro de un bloque que tolera
 * el fallo a propósito: en algunos proyectos el rol del SQL Editor no es
 * dueño de esa tabla y el CREATE POLICY revienta con "must be owner of
 * table objects". Si pasa eso, el script sigue y las políticas se crean a
 * mano en Storage → media → Policies (son las cuatro de acá abajo).
 */
do $storage$
begin
  drop policy if exists "media: lectura pública" on storage.objects;
  create policy "media: lectura pública"
    on storage.objects for select
    using (bucket_id = 'media');

  drop policy if exists "media: sube el admin" on storage.objects;
  create policy "media: sube el admin"
    on storage.objects for insert
    with check (bucket_id = 'media' and public.is_admin());

  drop policy if exists "media: reemplaza el admin" on storage.objects;
  create policy "media: reemplaza el admin"
    on storage.objects for update
    using (bucket_id = 'media' and public.is_admin());

  drop policy if exists "media: borra el admin" on storage.objects;
  create policy "media: borra el admin"
    on storage.objects for delete
    using (bucket_id = 'media' and public.is_admin());
exception
  when insufficient_privilege then
    raise warning 'No se pudieron crear las políticas de storage.objects. Créalas a mano en Storage → media → Policies.';
end
$storage$;


-- ════════════════════════════════════════════════════════════════════════
-- 12. SEED — ajustes del sitio
-- ════════════════════════════════════════════════════════════════════════
--
-- Valores actuales de src/config/site.ts y src/lib/order-rules.ts, para que
-- el sitio se vea EXACTAMENTE igual el minuto después de migrar. Todo
-- `on conflict do nothing`: volver a correr el script no pisa lo que ya
-- hayas editado en el panel.
--
-- Se usa to_jsonb() en vez de escribir el JSON a mano porque así los
-- acentos, las comillas y los guiones largos no hay que escaparlos nunca.

insert into public.site_settings (key, value, label, help, kind, group_key, sort_order) values
  -- ── Identidad ──
  ('site.name', to_jsonb('Sálvame el PC'::text),
   'Nombre del sitio', 'Aparece en el título del navegador, el footer y los legales.', 'text', 'identidad', 10),
  ('site.tagline', to_jsonb('Hardware y periféricos sin vueltas'::text),
   'Bajada', null, 'text', 'identidad', 20),
  ('site.description', to_jsonb('Tienda de hardware y periféricos en Santiago, Chile: mouse, teclados, RAM, audífonos, monitores y GPU. Servicio técnico y despacho a todo el país.'::text),
   'Descripción SEO por defecto', 'La que usa Google cuando la página no trae una propia. Ideal: 150-160 caracteres.', 'textarea', 'identidad', 30),
  ('site.url', to_jsonb('https://salvameelpc.cl'::text),
   'URL del sitio', 'Sin slash final.', 'url', 'identidad', 40),
  ('site.locale', to_jsonb('es-CL'::text),
   'Idioma', 'Formato de fechas y precios. No cambiar salvo que el sitio cambie de país.', 'text', 'identidad', 50),

  -- ── Navegación ──
  ('nav.main', '[{"href":"/tienda","label":"Tienda"},{"href":"/servicio-tecnico","label":"Servicio técnico"},{"href":"/contacto","label":"Contacto"}]'::jsonb,
   'Menú principal', 'Los enlaces del header, en orden.', 'json', 'navegacion', 10),
  ('nav.footer_tienda', '[{"href":"/tienda","label":"Catálogo"},{"href":"/carrito","label":"Carrito"},{"href":"/servicio-tecnico","label":"Servicio técnico"}]'::jsonb,
   'Footer — columna Tienda', null, 'json', 'navegacion', 20),
  ('nav.footer_ayuda', '[{"href":"/contacto","label":"Contacto"},{"href":"/terminos-y-condiciones#despacho","label":"Envíos y devoluciones"},{"href":"/terminos-y-condiciones","label":"Términos y condiciones"},{"href":"/politica-de-privacidad","label":"Política de privacidad"}]'::jsonb,
   'Footer — columna Ayuda', null, 'json', 'navegacion', 30),

  -- ── Contacto ──
  ('contact.whatsapp_display', to_jsonb('+56 9 0000 0000'::text),
   'WhatsApp (como se muestra)', '⚠️ Placeholder del handoff. Reemplazar por el número real.', 'phone', 'contacto', 10),
  ('contact.whatsapp_url', to_jsonb('https://wa.me/56900000000'::text),
   'WhatsApp (enlace)', 'Formato https://wa.me/56912345678, sin espacios ni signos.', 'url', 'contacto', 20),
  ('contact.instagram_handle', to_jsonb('@salvamelpc'::text),
   'Instagram (usuario)', null, 'text', 'contacto', 30),
  ('contact.instagram_url', to_jsonb('https://instagram.com'::text),
   'Instagram (enlace)', '⚠️ Placeholder: hoy apunta a la home de Instagram, no al perfil.', 'url', 'contacto', 40),
  ('contact.address', to_jsonb(array['Av. Providencia 1234, local 56','Providencia, Santiago']),
   'Dirección', 'Una línea por renglón. ⚠️ Placeholder del handoff.', 'list', 'contacto', 50),
  ('contact.hours', to_jsonb(array['Lun a Vie · 10:00 — 19:00','Sábado · 10:00 — 14:00']),
   'Horario de atención', 'Una línea por renglón.', 'list', 'contacto', 60),
  ('contact.maps_embed_url', to_jsonb(''::text),
   'Mapa (URL del embed)', 'Google Maps → Compartir → Insertar un mapa → copiar el src del iframe. Vacío = se muestra el placeholder rayado.', 'url', 'contacto', 70),

  -- ── Comercio ──
  ('shipping.cost_clp', to_jsonb(3990),
   'Costo de despacho (CLP)', 'Se usa en el carrito Y en los términos: cambiarlo acá los mantiene sincronizados.', 'number', 'comercio', 10),
  ('shipping.free_from_clp', to_jsonb(50000),
   'Envío gratis desde (CLP)', 'Subtotal a partir del cual el despacho sale $0.', 'number', 'comercio', 20),
  ('shipping.max_quantity_per_line', to_jsonb(20),
   'Máximo por producto', 'Tope de unidades del mismo producto en un pedido.', 'number', 'comercio', 30),
  ('promo.text', to_jsonb('Envío gratis sobre $50.000 · Pago seguro con TUU · Despacho a todo Chile'::text),
   'Cintillo promocional', 'La barra que corre arriba del header.', 'text', 'comercio', 40),
  ('footer.tagline', to_jsonb('Hardware, periféricos y servicio técnico. Santiago, Chile — despacho a todo el país.'::text),
   'Footer — texto bajo el logo', null, 'textarea', 'comercio', 50),
  ('footer.payment_note', to_jsonb('pagos procesados por tuu'::text),
   'Footer — nota de pagos', 'Corregido: el sitio decía "mercado pago" pero la pasarela es TUU.', 'text', 'comercio', 60),

  -- ── Legales ──
  -- Los corchetes son un seguro, no un descuido: si el sitio sale a
  -- producción con esto puesto se ve a la legua. La Ley 19.496 exige que el
  -- comprador sepa a quién le está comprando, así que no son opcionales.
  ('legal.razon_social', to_jsonb('[ razón social pendiente ]'::text),
   'Razón social', '⚠️ OBLIGATORIO por Ley 19.496 antes de vender.', 'text', 'legal', 10),
  ('legal.rut', to_jsonb('[ rut pendiente ]'::text),
   'RUT de la empresa', '⚠️ OBLIGATORIO por Ley 19.496 antes de vender.', 'text', 'legal', 20),
  ('legal.domicilio', to_jsonb('[ domicilio legal pendiente ]'::text),
   'Domicilio legal', '⚠️ OBLIGATORIO. Puede o no coincidir con la dirección de la tienda.', 'text', 'legal', 30),
  ('legal.correo_datos', to_jsonb('[ correo de datos pendiente ]'::text),
   'Correo para datos personales', 'Casilla donde se ejercen los derechos ARCOP (Ley 19.628).', 'email', 'legal', 40),
  ('legal.correo_contacto', to_jsonb('[ correo de contacto pendiente ]'::text),
   'Correo para reclamos y compras', null, 'email', 'legal', 50)
on conflict (key) do nothing;


-- ════════════════════════════════════════════════════════════════════════
-- 13. SEED — catálogo
-- ════════════════════════════════════════════════════════════════════════
--
-- Los 12 productos de src/data/productos.json, CON SUS IDS ACTUALES. Eso es
-- lo que hace que un carrito ya guardado en el localStorage de un visitante
-- siga apuntando a los mismos productos después de la migración.
--
-- Las fotos siguen siendo las de Unsplash del handoff: se reemplazan una a
-- una desde el panel subiéndolas al bucket `media`.
--
-- ⚠️ track_stock va en false a propósito. Hoy el sitio vende sin control de
-- inventario, y sembrar stock 0 con control activo marcaría TODA venta como
-- "sin stock". Cuando cargues las cantidades reales, actívalo por producto.

insert into public.products
  (id, slug, name, brand, category, price_clp, compare_at_price_clp,
   is_featured, photo_url, specs, sort_order, stock, track_stock, is_published)
select v.id, v.slug, v.name, v.brand, v.category, v.price_clp, v.compare_at_price_clp,
       v.is_featured, v.photo_url, v.specs, v.sort_order, 0, false, true
from (values
  (1, 'mouse-redragon-cobra-m711', 'Mouse Redragon Cobra M711', 'Redragon', 'Mouse', 19990, 24990, true, 'https://images.unsplash.com/photo-1527814050087-3793815479db?q=80&w=900&auto=format&fit=crop', array['Sensor óptico 10.000 DPI ajustable', 'RGB Chroma 16.8M colores', '7 botones programables', 'Cable trenzado 1.8 m'], 10),
  (2, 'mouse-logitech-g502-hero', 'Mouse Logitech G502 Hero', 'Logitech', 'Mouse', 44990, null, false, 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?q=80&w=900&auto=format&fit=crop', array['Sensor HERO 25K DPI', '11 botones programables', 'Pesas ajustables (5×3.6 g)', 'Memoria integrada 5 perfiles'], 20),
  (3, 'teclado-redragon-kumara-k552', 'Teclado Redragon Kumara K552 RGB', 'Redragon', 'Teclados', 29990, 34990, true, 'https://images.unsplash.com/photo-1541140532154-b024d705b90a?q=80&w=900&auto=format&fit=crop', array['Mecánico switch red', 'Formato TKL 87 teclas', 'Retroiluminación RGB por tecla', 'Construcción metálica'], 30),
  (4, 'teclado-logitech-g413-tkl', 'Teclado Logitech G413 TKL SE', 'Logitech', 'Teclados', 54990, null, false, 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?q=80&w=900&auto=format&fit=crop', array['Switches táctiles mecánicos', 'Placa superior de aluminio', 'Retroiluminación blanca', 'Teclas PBT resistentes'], 40),
  (5, 'ram-kingston-fury-beast-16gb-ddr5', 'RAM Kingston Fury Beast 16GB DDR5 5200', 'Kingston', 'RAM', 54990, null, true, 'https://images.unsplash.com/photo-1562976540-1502c2145186?q=80&w=900&auto=format&fit=crop', array['16 GB (1×16) DDR5 5200 MT/s', 'CL40, 1.25 V', 'Perfil Intel XMP 3.0', 'Disipador de bajo perfil'], 50),
  (6, 'ram-corsair-vengeance-32gb-ddr4', 'RAM Corsair Vengeance 32GB DDR4 3200', 'Corsair', 'RAM', 79990, 94990, false, 'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?q=80&w=900&auto=format&fit=crop', array['32 GB (2×16) DDR4 3200 MHz', 'CL16, 1.35 V', 'Perfil XMP 2.0', 'Compatible Intel y AMD'], 60),
  (7, 'audifonos-hyperx-cloud-ii', 'Audífonos HyperX Cloud II', 'HyperX', 'Audífonos', 64990, null, false, 'https://images.unsplash.com/photo-1599669454699-248893623440?q=80&w=900&auto=format&fit=crop', array['Sonido envolvente 7.1 virtual', 'Drivers 53 mm', 'Micrófono desmontable', 'Almohadillas memory foam'], 70),
  (8, 'audifonos-logitech-g435', 'Audífonos Logitech G435 Lightspeed', 'Logitech', 'Audífonos', 49990, 59990, true, 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?q=80&w=900&auto=format&fit=crop', array['Inalámbrico Lightspeed + Bluetooth', 'Solo 165 g', '18 h de batería', 'Micrófonos beamforming'], 80),
  (9, 'monitor-samsung-odyssey-g5-27', 'Monitor Samsung Odyssey G5 27" 144Hz', 'Samsung', 'Monitores', 249990, null, false, 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?q=80&w=900&auto=format&fit=crop', array['27" QHD 2560×1440 curvo', '144 Hz, 1 ms', 'FreeSync Premium', 'HDR10'], 90),
  (10, 'monitor-lg-ultragear-24', 'Monitor LG UltraGear 24" 165Hz', 'LG', 'Monitores', 179990, 199990, false, 'https://images.unsplash.com/photo-1547394765-185e1e68f34e?q=80&w=900&auto=format&fit=crop', array['24" FHD IPS 165 Hz', '1 ms MBR', 'G-Sync Compatible', 'Ajuste de inclinación'], 100),
  (11, 'gpu-geforce-rtx-4060-8gb', 'GPU GeForce RTX 4060 8GB', 'MSI', 'GPU', 379990, null, false, 'https://images.unsplash.com/photo-1591488320449-011701bb6704?q=80&w=900&auto=format&fit=crop', array['8 GB GDDR6', 'DLSS 3 + Ray Tracing', 'Doble ventilador', 'PCIe 4.0, 115 W'], 110),
  (12, 'gpu-radeon-rx-7600-8gb', 'GPU Radeon RX 7600 8GB', 'ASUS', 'GPU', 329990, 359990, false, 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?q=80&w=900&auto=format&fit=crop', array['8 GB GDDR6', 'RDNA 3', 'Doble ventilador Axial-tech', 'PCIe 4.0, 165 W'], 120)
) as v(id, slug, name, brand, category, price_clp, compare_at_price_clp,
       is_featured, photo_url, specs, sort_order)
on conflict (id) do nothing;

-- La secuencia quedó en 1 porque los ids se insertaron a mano: sin esto, el
-- primer producto que crees desde el panel choca contra el id 1.
select setval(
  pg_get_serial_sequence('public.products', 'id'),
  coalesce((select max(id) from public.products), 1),
  true
);


-- ════════════════════════════════════════════════════════════════════════
-- 14. SEED — páginas y secciones
-- ════════════════════════════════════════════════════════════════════════
--
-- Cada texto que hoy está escrito a mano en los .astro, ya cargado acá. El
-- `slug` de la página y el `key` de la sección son el contrato con el
-- código: el componente pide page_sections['home']['hero'] y espera esas
-- claves dentro de `content`. Renombrarlos desde el panel deja la sección
-- huérfana — por eso el editor los muestra bloqueados.
--
-- `fields` es lo que hace que el panel no necesite una pantalla por página:
-- lee el descriptor, dibuja los inputs y guarda en `content`.

insert into public.pages (slug, name, route, seo_title, seo_description, sort_order) values
  ('home', 'Inicio', '/', 'Inicio', null, 10),
  ('tienda', 'Tienda', '/tienda', 'Tienda', 'Catálogo de hardware y periféricos: mouse, teclados, RAM, audífonos, monitores y GPU.', 20),
  ('servicio-tecnico', 'Servicio técnico', '/servicio-tecnico', 'Servicio técnico', 'Armado de PC, reparación y mantención en Santiago. Diagnóstico en 24 horas, repuestos originales y videos reales de cada trabajo.', 30),
  ('contacto', 'Contacto', '/contacto', 'Contacto', 'Escríbenos por consultas de productos, servicio técnico o el estado de tu pedido. Respondemos dentro del día, de lunes a sábado.', 40),
  ('404', 'Página no encontrada', '/404', 'Página no encontrada', null, 90),
  ('pago-exito', 'Resultado del pago', '/pago/exito', 'Resultado del pago', null, 80),
  ('pago-cancelado', 'Pago cancelado', '/pago/cancelado', 'Pago cancelado', null, 81),
  ('carrito', 'Carrito', '/carrito', 'Tu carrito', 'Revisa los productos de tu carrito antes de ir al checkout.', 60),
  ('checkout', 'Checkout', '/checkout', 'Checkout', 'Completa tus datos de despacho y paga de forma segura con TUU.', 61)
on conflict (slug) do nothing;


insert into public.page_sections (page_id, key, name, content, fields, sort_order)
select p.id, v.key, v.name, v.content::jsonb, v.fields::jsonb, v.sort_order
from (values
  ('home', 'hero', 'Hero principal', '{"eyebrow": "Tienda de hardware — Santiago, Chile", "heading": "Hardware y periféricos", "heading_accent": "sin vueltas.", "cta_primary_label": "Ver catálogo →", "cta_primary_href": "/tienda", "cta_secondary_label": "Servicio técnico", "cta_secondary_href": "/servicio-tecnico", "note": "envío a todo chile · pago seguro con tuu"}', '{"eyebrow": {"label": "Antetítulo", "kind": "text"}, "heading": {"label": "Título", "kind": "text"}, "heading_accent": {"label": "Título (parte en coral)", "kind": "text"}, "cta_primary_label": {"label": "Botón principal", "kind": "text"}, "cta_primary_href": {"label": "Botón principal — enlace", "kind": "url"}, "cta_secondary_label": {"label": "Botón secundario", "kind": "text"}, "cta_secondary_href": {"label": "Botón secundario — enlace", "kind": "url"}, "note": {"label": "Nota al lado de los botones", "kind": "text", "help": "Corregido: decía «pago con mercado pago» y la pasarela es TUU."}}', 10),
  ('home', 'bento_servicio', 'Bento — tile de servicio técnico', '{"eyebrow": "Servicio técnico", "heading": "Armamos, reparamos y revivimos tu PC", "href": "/servicio-tecnico"}', '{"eyebrow": {"label": "Antetítulo", "kind": "text"}, "heading": {"label": "Título", "kind": "text"}, "href": {"label": "Enlace", "kind": "url"}}', 20),
  ('home', 'marquee', 'Cinta de marcas', '{"brands": ["Redragon", "Logitech"]}', '{"brands": {"label": "Marcas", "kind": "list", "help": "Se repiten en bucle hasta cubrir la pantalla."}}', 30),
  ('home', 'destacados', 'Destacados', '{"heading": "Destacados", "link_label": "ver todo →", "link_href": "/tienda"}', '{"heading": {"label": "Título", "kind": "text"}, "link_label": {"label": "Enlace", "kind": "text"}, "link_href": {"label": "Enlace — destino", "kind": "url"}}', 40),
  ('home', 'ofertas', 'Ofertas de la semana', '{"heading": "Ofertas de la semana", "note": "hasta agotar stock"}', '{"heading": {"label": "Título", "kind": "text"}, "note": {"label": "Nota a la derecha", "kind": "text", "help": "Los productos salen solos: son los que tienen precio anterior."}}', 50),
  ('home', 'banner_servicio', 'Banner de servicio técnico', '{"eyebrow": "Servicio técnico", "heading": "¿Tu PC pide ayuda a gritos?", "body": "Armado desde cero, reparación y mantención. Grabamos cada trabajo para que veas exactamente qué hicimos.", "cta_label": "Conoce el servicio →", "cta_href": "/servicio-tecnico", "video_url": "", "video_caption": "[ video: armado pc gamer / 2:14 ]"}', '{"eyebrow": {"label": "Antetítulo", "kind": "text"}, "heading": {"label": "Título", "kind": "text"}, "body": {"label": "Texto", "kind": "textarea"}, "cta_label": {"label": "Botón", "kind": "text"}, "cta_href": {"label": "Botón — enlace", "kind": "url"}, "video_url": {"label": "Video", "kind": "url", "help": "YouTube o archivo. Vacío = placeholder rayado."}, "video_caption": {"label": "Pie del video", "kind": "text"}}', 60),
  ('tienda', 'encabezado', 'Encabezado del catálogo', '{"heading": "Catálogo", "count_suffix": "productos"}', '{"heading": {"label": "Título", "kind": "text"}, "count_suffix": {"label": "Palabra después del contador", "kind": "text"}}', 10),
  ('tienda', 'filtros', 'Filtros', '{"label_categoria": "Categoría", "label_marca": "Marca", "label_orden": "Ordenar", "chip_todos": "Todos", "orden_relevancia": "Relevancia", "orden_menor": "Precio: menor a mayor", "orden_mayor": "Precio: mayor a menor"}', '{"label_categoria": {"label": "Rótulo — categoría", "kind": "text"}, "label_marca": {"label": "Rótulo — marca", "kind": "text"}, "label_orden": {"label": "Rótulo — ordenar", "kind": "text"}, "chip_todos": {"label": "Chip «todas las categorías»", "kind": "text"}, "orden_relevancia": {"label": "Orden — relevancia", "kind": "text"}, "orden_menor": {"label": "Orden — menor a mayor", "kind": "text"}, "orden_mayor": {"label": "Orden — mayor a menor", "kind": "text"}}', 20),
  ('servicio-tecnico', 'hero', 'Hero', '{"eyebrow": "No lo botes todavía", "heading": "Servicio", "heading_line2": "técnico", "body": "Trabajamos con repuestos originales y grabamos cada proceso. Acá abajo puedes ver videos reales de lo que hacemos en el taller."}', '{"eyebrow": {"label": "Antetítulo", "kind": "text"}, "heading": {"label": "Título — línea 1", "kind": "text"}, "heading_line2": {"label": "Título — línea 2", "kind": "text"}, "body": {"label": "Texto", "kind": "textarea"}}', 10),
  ('servicio-tecnico', 'servicios', 'Los servicios', '{"items": [{"number": "01", "title": "Armado de PC", "description": "Desde la elección de componentes hasta el cable management. Armamos tu equipo según tu presupuesto.", "price": "desde $25.000"}, {"number": "02", "title": "Reparación", "description": "Diagnóstico en 24 horas. Pantallas, fuentes, placas y todo lo que deje de funcionar.", "price": "diagnóstico $10.000"}, {"number": "03", "title": "Mantención y limpieza", "description": "Limpieza profunda, cambio de pasta térmica y optimización para que vuelva a rendir como nuevo.", "price": "desde $15.000"}]}', '{"items": {"label": "Servicios", "kind": "list", "help": "Se muestran en columnas, en este orden.", "of": {"number": {"label": "Número", "kind": "text"}, "title": {"label": "Título", "kind": "text"}, "description": {"label": "Descripción", "kind": "textarea"}, "price": {"label": "Precio", "kind": "text"}}}}', 20),
  ('servicio-tecnico', 'videos', 'Videos del taller', '{"heading": "Así trabajamos", "heading_accent": "(en video)", "items": [{"caption": "[ armado pc gamer / 2:14 ]", "url": ""}, {"caption": "[ cambio pasta térmica / 1:47 ]", "url": ""}, {"caption": "[ reparación notebook / 3:02 ]", "url": ""}]}', '{"heading": {"label": "Título", "kind": "text"}, "heading_accent": {"label": "Título (parte en coral)", "kind": "text"}, "items": {"label": "Videos", "kind": "list", "help": "Sin URL se muestra el placeholder rayado con el pie de foto.", "of": {"caption": {"label": "Pie del video", "kind": "text"}, "url": {"label": "URL del video", "kind": "url"}}}}', 30),
  ('servicio-tecnico', 'cta', 'CTA de WhatsApp', '{"heading": "Agenda por WhatsApp"}', '{"heading": {"label": "Título", "kind": "text", "help": "El número sale de Ajustes → Contacto."}}', 40),
  ('contacto', 'hero', 'Encabezado', '{"heading": "Hablemos", "body": "Respondemos dentro del día, de lunes a sábado."}', '{"heading": {"label": "Título", "kind": "text"}, "body": {"label": "Bajada", "kind": "text"}}', 10),
  ('contacto', 'formulario', 'Formulario', '{"subjects": ["Consulta por producto", "Servicio técnico", "Estado de mi pedido", "Otro"], "placeholder_nombre": "Nombre", "placeholder_correo": "Correo electrónico", "placeholder_mensaje": "Cuéntanos en qué te ayudamos", "submit_label": "Enviar mensaje →", "success_label": "Mensaje enviado ✓", "success_body": "Gracias por escribirnos. Te responderemos dentro del día."}', '{"subjects": {"label": "Asuntos del desplegable", "kind": "list"}, "placeholder_nombre": {"label": "Placeholder — nombre", "kind": "text"}, "placeholder_correo": {"label": "Placeholder — correo", "kind": "text"}, "placeholder_mensaje": {"label": "Placeholder — mensaje", "kind": "text"}, "submit_label": {"label": "Botón de envío", "kind": "text"}, "success_label": {"label": "Confirmación — rótulo", "kind": "text"}, "success_body": {"label": "Confirmación — texto", "kind": "textarea"}}', 20),
  ('contacto', 'datos', 'Datos de la tienda', '{"label_direccion": "Taller y tienda", "label_horario": "Horario", "label_redes": "Redes sociales", "map_caption": "[ mapa: providencia, santiago ]"}', '{"label_direccion": {"label": "Rótulo — dirección", "kind": "text"}, "label_horario": {"label": "Rótulo — horario", "kind": "text"}, "label_redes": {"label": "Rótulo — redes", "kind": "text"}, "map_caption": {"label": "Pie del mapa", "kind": "text", "help": "Se ve solo si no hay URL de mapa en Ajustes → Contacto."}}', 30),
  ('404', 'contenido', 'Contenido', '{"label": "[ error 404 ]", "heading": "Página", "heading_line2": "perdida", "body": "Puede que el enlace esté roto o que el producto ya no esté disponible.", "cta_primary_label": "Ver catálogo →", "cta_primary_href": "/tienda", "cta_secondary_label": "Ir al inicio", "cta_secondary_href": "/"}', '{"label": {"label": "Rótulo mono", "kind": "text"}, "heading": {"label": "Título — línea 1", "kind": "text"}, "heading_line2": {"label": "Título — línea 2", "kind": "text"}, "body": {"label": "Texto", "kind": "textarea"}, "cta_primary_label": {"label": "Botón principal", "kind": "text"}, "cta_primary_href": {"label": "Botón principal — enlace", "kind": "url"}, "cta_secondary_label": {"label": "Botón secundario", "kind": "text"}, "cta_secondary_href": {"label": "Botón secundario — enlace", "kind": "url"}}', 10),
  ('pago-exito', 'estados', 'Textos por estado del pago', '{"pending": {"label": "[ verificando pago… ]", "titulo": "Confirmando tu pago…", "detalle": "Estamos esperando la confirmación de la pasarela. No cierres esta ventana."}, "completed": {"label": "[ pago confirmado ]", "titulo": "¡Gracias por tu compra!", "detalle": "Tu pago quedó confirmado. Te enviamos el detalle a tu correo y te escribimos para coordinar la entrega."}, "failed": {"label": "[ pago rechazado ]", "titulo": "El pago no se completó.", "detalle": "No se realizó ningún cargo. Puedes intentar de nuevo con otro medio de pago; tu carrito sigue disponible."}, "unknown": {"label": "[ orden no encontrada ]", "titulo": "No encontramos esta orden.", "detalle": "Si acabas de pagar, escríbenos con el número de orden y lo revisamos. No vuelvas a pagar antes de hablar con nosotros."}}', '{"pending": {"label": "Esperando confirmación", "kind": "json"}, "completed": {"label": "Pago confirmado", "kind": "json"}, "failed": {"label": "Pago rechazado", "kind": "json"}, "unknown": {"label": "Orden no encontrada", "kind": "json"}}', 10),
  ('pago-cancelado', 'contenido', 'Contenido', '{"label": "[ pago cancelado ]", "heading": "Cancelaste", "heading_line2": "el pago", "body": "No se realizó ningún cargo y tu carrito sigue tal como lo dejaste.", "cta_primary_label": "Retomar el pago →", "cta_primary_href": "/checkout", "cta_secondary_label": "Ver mi carrito", "cta_secondary_href": "/carrito"}', '{"label": {"label": "Rótulo mono", "kind": "text"}, "heading": {"label": "Título — línea 1", "kind": "text"}, "heading_line2": {"label": "Título — línea 2", "kind": "text"}, "body": {"label": "Texto", "kind": "textarea"}, "cta_primary_label": {"label": "Botón principal", "kind": "text"}, "cta_primary_href": {"label": "Botón principal — enlace", "kind": "url"}, "cta_secondary_label": {"label": "Botón secundario", "kind": "text"}, "cta_secondary_href": {"label": "Botón secundario — enlace", "kind": "url"}}', 10)
) as v(page_slug, key, name, content, fields, sort_order)
join public.pages p on p.slug = v.page_slug
on conflict (page_id, key) do nothing;


-- ════════════════════════════════════════════════════════════════════════
-- 15. SEED — documentos legales
-- ════════════════════════════════════════════════════════════════════════
--
-- La prosa completa de los dos documentos, tal como está publicada hoy,
-- convertida a HTML editable.
--
-- Los {{placeholders}} son la parte importante: en vez de congelar la razón
-- social o el costo de despacho dentro del texto, el documento los pide de
-- site_settings al renderizar. Así es imposible que la letra chica diga
-- $3.990 y el checkout cobre otra cosa — que la contradicción entre ambos
-- es justamente lo que sanciona el SERNAC.
--
-- Placeholders disponibles: cualquier clave de site_settings. Los numéricos
-- ({{shipping.cost_clp}}) los formatea el front con formatCLP().
--
-- ⚠️ content_updated_on tiene que cambiar cuando cambia EL TEXTO, no cuando
-- se recompila el sitio. Un documento legal que dice "actualizado hoy" en
-- cada build deja de ser trazable: ante un reclamo hay que poder demostrar
-- qué versión estaba vigente el día de la compra.

insert into public.legal_documents (slug, title, intro, seo_description, content_updated_on, sort_order) values
  ('terminos-y-condiciones', 'Términos y condiciones', 'Estas son las condiciones bajo las que vendemos en este sitio. Están escritas para que se entiendan: si algo no queda claro, escríbenos antes de comprar.', 'Condiciones de venta de Sálvame el PC: precios, despacho, derecho a retracto, garantía legal y servicio técnico.', date '2026-08-19', 10),
  ('politica-de-privacidad', 'Política de privacidad', 'Qué datos tuyos guardamos, para qué los usamos y cómo puedes pedirnos que los corrijamos o los borremos. Sin letra chica escondida.', 'Cómo Sálvame el PC recopila, usa y protege tus datos personales, y cómo puedes ejercer tus derechos.', date '2026-08-19', 20)
on conflict (slug) do nothing;


insert into public.legal_sections (document_id, anchor, title, body_html, sort_order)
select d.id, v.anchor, v.title, v.body_html, v.sort_order
from (values
  ('terminos-y-condiciones', 'quienes-somos', 'Quiénes somos', '<p>Este sitio es operado por {{legal.razon_social}}, RUT {{legal.rut}}, con domicilio en {{legal.domicilio}}, en adelante «{{site.name}}», «nosotros» o «el proveedor».</p>
<p>Para cualquier consulta, reclamo o gestión relacionada con tu compra puedes escribirnos a {{legal.correo_contacto}}, por WhatsApp al {{contact.whatsapp_display}} o desde nuestra <a href="/contacto">página de contacto</a>.</p>', 10),
  ('terminos-y-condiciones', 'aceptacion', 'Aceptación de estos términos', '<p>Al comprar en este sitio aceptas estas condiciones en la versión publicada al momento de tu compra. Te recomendamos guardar una copia junto con el comprobante: es el respaldo de lo que acordamos.</p>
<p>Estas condiciones no reemplazan ni limitan los derechos que te da la Ley N° 19.496 sobre protección de los derechos de los consumidores. Si alguna cláusula la contradijera, manda la ley. Y si una cláusula resultara ambigua, se interpreta a tu favor, como dispone la Ley N° 21.398.</p>', 20),
  ('terminos-y-condiciones', 'productos-precios', 'Productos, precios y stock', '<ul>
<li>Todos los precios están expresados en <strong>pesos chilenos (CLP) e incluyen IVA</strong>.</li>
<li>Antes de pagar verás el <strong>precio total</strong>, con el costo de despacho incluido. No agregamos cargos después de esa pantalla.</li>
<li>Publicamos solo productos con stock disponible. Si detectamos que un producto quedó sin stock después de tu compra, te contactamos de inmediato y te devolvemos el total pagado.</li>
<li>Las fotografías son referenciales. Las características relevantes de cada producto —marca, modelo y especificaciones— están en su ficha.</li>
<li>Un error evidente de precio (por ejemplo, un producto de $200.000 publicado en $200) no constituye una oferta válida. En ese caso te avisamos y anulamos la compra con devolución total, sin costo para ti.</li>
</ul>', 30),
  ('terminos-y-condiciones', 'compra', 'Cómo se compra', '<ol>
<li>Agregas productos al carrito y vas al checkout.</li>
<li>Eliges cómo quieres recibir el pedido y completas tus datos.</li>
<li>Pagas a través de TUU, la pasarela de pagos de Haulmer.</li>
<li>Te enviamos por correo la <strong>confirmación escrita</strong> del pedido, con el detalle de lo comprado, el precio total, la forma de entrega y estas condiciones.</li>
</ol>
<p>Esa confirmación no es un trámite: la ley nos obliga a enviarla. Si no la recibes, tu plazo para retractarte se extiende de 10 a <strong>90 días corridos</strong>. Revisa tu carpeta de spam y, si no está, escríbenos.</p>
<p>Para comprar necesitas ser mayor de 18 años y entregar datos verdaderos. Los datos que nos das los tratamos según nuestra <a href="/politica-de-privacidad">política de privacidad</a>.</p>', 40),
  ('terminos-y-condiciones', 'pago', 'Medios de pago', '<p>Los pagos se procesan a través de <strong>TUU</strong> (Haulmer SpA), que admite tarjetas de crédito, débito y otros medios habilitados por esa plataforma.</p>
<p>El pago ocurre en el entorno de TUU, no en este sitio: <strong>no vemos ni almacenamos los datos de tu tarjeta</strong> en ningún momento. Nosotros solo recibimos la confirmación de que el pago se aprobó.</p>
<p>Si desconoces un cargo hecho con tu tarjeta, además de avisarnos debes reclamarlo ante tu banco o emisor, que es quien responde según la Ley N° 20.009.</p>', 50),
  ('terminos-y-condiciones', 'despacho', 'Despacho y entrega', '<p>Al momento de comprar eliges entre dos formas de recibir tu pedido:</p>
<ul>
<li><strong>Despacho a domicilio.</strong> Llevamos el pedido a la dirección que indiques. El costo es de {{shipping.cost_clp}} y es <strong>gratis en compras iguales o superiores a {{shipping.free_from_clp}}</strong>. Despachamos a todo Chile.</li>
<li><strong>Acordar entrega.</strong> Coordinamos contigo el punto y la hora de entrega. No tiene costo de despacho.</li>
</ul>
<p>El plazo estimado de entrega se te informa antes de pagar y se repite en la confirmación del pedido. Los plazos se cuentan en días hábiles desde que el pago queda aprobado.</p>
<p>Si nadie recibe el pedido en la dirección indicada, el transportista dejará aviso e intentará una segunda entrega. Un tercer intento por dirección incorrecta o ausencia reiterada puede tener un costo adicional, que te informaremos antes de cobrarlo.</p>
<p>Revisa el paquete al recibirlo. Si llega con daño visible, déjalo consignado con el transportista y avísanos dentro de las 24 horas siguientes para resolverlo sin que tengas que hacer nada más.</p>', 60),
  ('terminos-y-condiciones', 'retracto', 'Derecho a retracto', '<p>Como compraste a distancia, tienes <strong>10 días corridos desde que recibiste el producto</strong> para arrepentirte sin necesidad de dar explicaciones. Es un derecho que te da el artículo 3° bis de la Ley N° 19.496 y que no te podemos quitar.</p>
<p>Para ejercerlo:</p>
<ol>
<li>Escríbenos a {{legal.correo_contacto}} o por WhatsApp indicando tu número de pedido. Basta con que digas que te retractas.</li>
<li>Devuelve el producto <strong>sin uso</strong>, completo, con sus accesorios y su embalaje original en buen estado.</li>
<li>Te devolvemos el <strong>total pagado, sin descontar gastos</strong>, a la brevedad y siempre dentro de los <strong>45 días</strong> siguientes a tu aviso, por el mismo medio con que pagaste.</li>
</ol>
<p>El costo de enviarnos el producto de vuelta es de tu cargo, salvo que la devolución se deba a un problema nuestro (producto equivocado, defectuoso o dañado en el transporte): en ese caso lo asumimos nosotros.</p>
<p>El retracto no se aplica a productos hechos a pedido según tus especificaciones, ni a servicios ya prestados. Si un producto está excluido, te lo advertimos de forma destacada antes de que pagues.</p>', 70),
  ('terminos-y-condiciones', 'garantia', 'Garantía legal', '<p>Todos los productos tienen <strong>garantía legal de 6 meses</strong> contados desde que recibiste el producto, según la Ley N° 19.496 modificada por la Ley N° 21.398.</p>
<p>Si el producto sale malo, no sirve para lo que se ofreció o no corresponde a lo que compraste, <strong>tú eliges</strong> entre estas tres opciones —no las elegimos nosotros—:</p>
<ul>
<li>el <strong>cambio</strong> por otro producto igual;</li>
<li>la <strong>reparación</strong> gratuita; o</li>
<li>la <strong>devolución</strong> de lo que pagaste.</li>
</ul>
<p>Para hacerla efectiva basta con la boleta, factura o cualquier otro comprobante de la compra: no exigimos el envase ni el embalaje original. Los costos de traslado del producto para hacer efectiva la garantía son de nuestro cargo.</p>
<p>Además de la garantía legal, algunos productos tienen <strong>garantía del fabricante</strong> por un plazo mayor. Esa garantía es adicional y no reemplaza la legal ni la limita; te indicamos en la ficha cuando corresponde.</p>
<p>La garantía no cubre el desgaste normal por uso, ni daños por mal uso, golpes, líquidos, alteraciones o reparaciones hechas por terceros no autorizados.</p>', 80),
  ('terminos-y-condiciones', 'servicio-tecnico', 'Servicio técnico', '<p>Para los trabajos de armado, reparación y mantención rigen además estas condiciones:</p>
<ul>
<li>El diagnóstico tiene el valor publicado en la página de <a href="/servicio-tecnico">servicio técnico</a> y se descuenta del valor final si aceptas la reparación.</li>
<li>Antes de intervenir tu equipo te entregamos un <strong>presupuesto</strong>. No hacemos ningún trabajo que no hayas aprobado.</li>
<li>En la boleta del trabajo <strong>dejamos escrito el plazo por el que respondemos</strong> por esa reparación, como exige el artículo 41 de la Ley N° 19.496.</li>
<li>Si el servicio quedó defectuoso, puedes reclamarlo dentro de <strong>30 días hábiles</strong> desde que te entregamos el equipo reparado. Volvemos a prestarte el servicio sin costo o te devolvemos lo que pagaste.</li>
<li><strong>Respalda tu información antes de dejarnos el equipo.</strong> Hacemos todo lo posible por conservarla, pero una reparación puede implicar formatear o reemplazar el disco, y no respondemos por la pérdida de datos.</li>
<li>Los equipos deben retirarse dentro de los 30 días siguientes al aviso de que están listos. Pasado ese plazo podemos cobrar bodegaje.</li>
</ul>', 90),
  ('terminos-y-condiciones', 'responsabilidad', 'Responsabilidad', '<p>Respondemos por lo que la ley nos hace responsable: que el producto sea el ofrecido, que funcione, que llegue y que la garantía se cumpla.</p>
<p>No respondemos por interrupciones del sitio por causas fuera de nuestro control, ni por el uso que le des a un producto fuera de lo que indica su fabricante. Nada en esta sección limita los derechos que te da la Ley N° 19.496.</p>', 100),
  ('terminos-y-condiciones', 'propiedad-intelectual', 'Propiedad intelectual', '<p>La marca, el logo, los textos y el diseño de este sitio son de {{site.name}}. Las marcas y fotografías de los productos pertenecen a sus respectivos fabricantes y se usan para identificarlos.</p>', 110),
  ('terminos-y-condiciones', 'cambios', 'Cambios a estos términos', '<p>Podemos actualizar estas condiciones. Los cambios rigen para las compras hechas <strong>después</strong> de su publicación: la compra que ya hiciste se rige por la versión vigente ese día. Arriba de esta página siempre está la fecha de la última actualización.</p>', 120),
  ('terminos-y-condiciones', 'ley-aplicable', 'Ley aplicable y reclamos', '<p>Estas condiciones se rigen por la ley chilena. Cualquier controversia queda sometida a los tribunales competentes según la Ley N° 19.496.</p>
<p>Si tienes un problema, escríbenos primero a {{legal.correo_contacto}}: lo más probable es que lo resolvamos ahí mismo. Si no quedas conforme, puedes reclamar ante el <strong>SERNAC</strong> en <a href="https://www.sernac.cl" rel="noopener">sernac.cl</a> o al 800 700 100.</p>', 130),
  ('politica-de-privacidad', 'responsable', 'Quién trata tus datos', '<p>El responsable del tratamiento de tus datos personales es {{legal.razon_social}}, RUT {{legal.rut}}, con domicilio en {{legal.domicilio}}, que opera este sitio bajo la marca «{{site.name}}».</p>
<p>Para cualquier tema relacionado con tus datos personales, escríbenos a {{legal.correo_datos}}.</p>', 10),
  ('politica-de-privacidad', 'que-datos', 'Qué datos recopilamos', '<p>Solo pedimos lo que necesitamos para venderte y entregarte lo que compraste.</p>
<h3>Los que tú nos entregas</h3>
<ul>
<li><strong>Al comprar:</strong> nombre y apellido, RUT, correo electrónico y teléfono. Si eliges despacho a domicilio, además tu región, comuna, calle y número. Si eliges acordar la entrega, no te pedimos dirección.</li>
<li><strong>Al escribirnos:</strong> nombre, correo y el contenido de tu mensaje.</li>
<li><strong>Al dejar tu equipo en servicio técnico:</strong> tus datos de contacto y los del equipo.</li>
</ul>
<h3>Los que se generan solos</h3>
<ul>
<li>Registros técnicos del servidor (dirección IP, fecha y hora, navegador), que se generan por el solo hecho de visitar cualquier sitio web y sirven para operarlo y detectar abusos.</li>
</ul>
<p><strong>No pedimos datos sensibles</strong> —salud, origen étnico, situación socioeconómica, afiliación política o sindical, entre otros— y te pedimos que no nos los envíes.</p>
<p><strong>No guardamos datos de tu tarjeta.</strong> El pago ocurre dentro de TUU; el número, la fecha de vencimiento y el código de seguridad nunca pasan por este sitio ni por nuestros servidores.</p>', 20),
  ('politica-de-privacidad', 'para-que', 'Para qué los usamos', '<p>Cada uso tiene una finalidad concreta y una base que lo permite. No usamos tus datos para nada que no esté en esta lista.</p>
<ul>
<li><strong>Procesar tu compra y entregártela</strong> — nombre, RUT, contacto y dirección. <em>Base:</em> ejecución del contrato de compraventa que celebraste con nosotros.</li>
<li><strong>Emitir la boleta o factura y llevar la contabilidad</strong> — nombre y RUT. <em>Base:</em> cumplimiento de una obligación legal tributaria.</li>
<li><strong>Responder tus consultas y reclamos, y atender la garantía</strong> — datos de contacto e historial de tu compra. <em>Base:</em> ejecución del contrato y cumplimiento de la Ley N° 19.496.</li>
<li><strong>Coordinar contigo la entrega</strong>, cuando elegiste acordarla — teléfono. <em>Base:</em> ejecución del contrato.</li>
<li><strong>Mantener el sitio seguro y funcionando</strong> — registros técnicos. <em>Base:</em> interés legítimo en operar el servicio y prevenir fraudes.</li>
<li><strong>Enviarte novedades u ofertas</strong>, solo si te suscribiste — correo. <em>Base:</em> tu consentimiento, que puedes retirar cuando quieras desde el enlace de cualquiera de esos correos.</li>
</ul>
<p><strong>No vendemos tus datos</strong> ni los entregamos a terceros para que te hagan publicidad.</p>', 30),
  ('politica-de-privacidad', 'con-quien', 'Con quién los compartimos', '<p>Compartimos lo mínimo, y solo con quienes necesitamos para que tu compra llegue a destino:</p>
<ul>
<li><strong>TUU (Haulmer SpA)</strong>, que procesa el pago. Le entregamos tu nombre, correo y teléfono para asociar la transacción a tu pedido. Ellos tratan tus datos de pago bajo su propia política de privacidad.</li>
<li><strong>La empresa de transporte</strong> que despacha tu pedido, cuando elegiste despacho a domicilio. Recibe tu nombre, dirección y teléfono para poder entregarte.</li>
<li><strong>Nuestros proveedores de infraestructura</strong> (alojamiento del sitio y correo), que actúan como encargados y solo pueden tratar los datos siguiendo nuestras instrucciones.</li>
<li><strong>Autoridades</strong>, cuando una ley o una resolución judicial nos obliga a entregarlos.</li>
</ul>
<p>Algunos de estos proveedores tienen servidores fuera de Chile, por lo que puede haber transferencia internacional de datos. En esos casos exigimos que ofrezcan un nivel de protección equivalente al de la ley chilena.</p>', 40),
  ('politica-de-privacidad', 'cuanto-tiempo', 'Cuánto tiempo los guardamos', '<ul>
<li><strong>Datos de compras:</strong> mientras dure la relación y, después, el plazo que exigen las normas tributarias y de consumo para poder responder por la garantía y ante un eventual reclamo.</li>
<li><strong>Consultas por contacto:</strong> hasta un año después de haberlas respondido.</li>
<li><strong>Suscripción a novedades:</strong> hasta que te des de baja.</li>
<li><strong>Registros técnicos:</strong> plazos acotados, del orden de meses.</li>
</ul>
<p>Cumplido el plazo, los eliminamos o los dejamos de forma que no permitan identificarte.</p>', 50),
  ('politica-de-privacidad', 'tus-derechos', 'Tus derechos', '<p>Sobre tus datos personales puedes ejercer, en cualquier momento y gratis:</p>
<ul>
<li><strong>Acceso:</strong> saber qué datos tuyos tenemos y qué hacemos con ellos.</li>
<li><strong>Rectificación:</strong> corregirlos si están errados o incompletos.</li>
<li><strong>Supresión:</strong> pedir que los borremos.</li>
<li><strong>Oposición:</strong> oponerte a un uso determinado.</li>
<li><strong>Portabilidad:</strong> pedir tus datos en un formato que puedas llevarte a otro lado.</li>
<li><strong>Bloqueo:</strong> suspender temporalmente su uso.</li>
</ul>
<p>Para ejercerlos escríbenos a {{legal.correo_datos}} indicando cuál quieres ejercer. Podemos pedirte que acredites tu identidad, para no entregarle tus datos a otra persona. <strong>Te respondemos dentro de 30 días corridos.</strong></p>
<p>Algunos derechos tienen límites: no podemos borrar datos que una ley nos obliga a conservar —una boleta, por ejemplo—. Si es el caso, te explicamos por qué.</p>', 60),
  ('politica-de-privacidad', 'seguridad', 'Seguridad', '<p>El sitio funciona sobre HTTPS, el acceso a los datos está restringido a quienes lo necesitan para su trabajo, y el pago se delega en TUU justamente para no manipular datos de tarjetas.</p>
<p>Ningún sistema es infalible. Si ocurre una vulneración de seguridad que afecte tus datos y pueda perjudicarte, <strong>te lo informaremos</strong> y lo notificaremos a la autoridad dentro de las <strong>72 horas</strong> siguientes a haberla detectado.</p>', 70),
  ('politica-de-privacidad', 'cookies', 'Cookies y almacenamiento local', '<p><strong>Este sitio no usa cookies de seguimiento, analítica ni publicidad.</strong> No tenemos Google Analytics, ni píxeles de redes sociales, ni herramientas que registren tu navegación.</p>
<p>Lo único que guardamos en tu navegador son dos cosas, ambas técnicas:</p>
<ul>
<li><strong>Tu carrito</strong>, para que los productos sigan ahí si cierras la pestaña y vuelves.</li>
<li><strong>Tu preferencia de tema</strong> (claro u oscuro), para respetar tu elección.</li>
</ul>
<p>Las dos viven en el <em>almacenamiento local</em> de tu propio navegador, no viajan a nuestros servidores y no permiten identificarte. Puedes borrarlas cuando quieras desde la configuración de tu navegador. Por eso este sitio no te muestra un banner de cookies: no habría nada que consentir.</p>
<p>Si en el futuro incorporamos herramientas de analítica o publicidad, actualizaremos esta política y te pediremos tu consentimiento antes de activarlas.</p>', 80),
  ('politica-de-privacidad', 'menores', 'Menores de edad', '<p>Este sitio está dirigido a mayores de 18 años y no recopilamos datos de menores a sabiendas. Si detectamos que recibimos datos de un menor sin autorización de quien lo tiene a su cargo, los eliminamos.</p>', 90),
  ('politica-de-privacidad', 'cambios', 'Cambios a esta política', '<p>Si cambiamos la forma en que tratamos tus datos, actualizamos esta página y su fecha. Cuando el cambio sea relevante —una finalidad nueva, un destinatario nuevo— te avisaremos por correo si tenemos cómo contactarte.</p>', 100),
  ('politica-de-privacidad', 'reclamos', 'Consultas y reclamos', '<p>Escríbenos a {{legal.correo_datos}} y lo resolvemos. Si no quedas conforme con nuestra respuesta, puedes reclamar ante la <strong>Agencia de Protección de Datos Personales</strong>, el organismo fiscalizador creado por la Ley N° 21.719, que comienza a operar con la entrada en vigencia de esa ley el 1 de diciembre de 2026.</p>
<p>Si tu reclamo es sobre una compra y no sobre tus datos, revisa nuestros <a href="/terminos-y-condiciones#ley-aplicable">términos y condiciones</a>.</p>', 110)
) as v(doc_slug, anchor, title, body_html, sort_order)
join public.legal_documents d on d.slug = v.doc_slug
on conflict (document_id, anchor) do nothing;


-- ════════════════════════════════════════════════════════════════════════
-- FIN. Verificación rápida de que quedó todo:
-- ════════════════════════════════════════════════════════════════════════
--   select 'productos', count(*) from public.products
--   union all select 'páginas',  count(*) from public.pages
--   union all select 'secciones', count(*) from public.page_sections
--   union all select 'ajustes',  count(*) from public.site_settings
--   union all select 'legales',  count(*) from public.legal_sections;
--
-- Esperado: 12 productos, 9 páginas, 18 secciones, 26 ajustes, 24 legales.
