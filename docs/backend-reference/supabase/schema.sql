-- ════════════════════════════════════════════════════════════════
-- Salvame el PC — schema inicial
-- Correr esto en Supabase → SQL Editor (o vía CLI/migraciones más adelante)
-- ════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Categorías ──────────────────────────────────────────────────
create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

-- ── Productos ───────────────────────────────────────────────────
create table products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id),
  slug text unique not null,
  name text not null,
  brand text not null,            -- Corsair, Kingston, G.Skill, etc.
  capacity_gb int not null,       -- 8, 16, 32...
  speed_mhz int,                  -- 3200, 3600...
  memory_type text not null,      -- DDR4, DDR5
  description text,
  price_clp int not null check (price_clp >= 0),  -- precio final CON IVA
  stock int not null default 0 check (stock >= 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  url text not null,
  sort_order int not null default 0
);

-- ── Pedidos ─────────────────────────────────────────────────────
create type order_status as enum (
  'pendiente',      -- creado, esperando pago
  'pagado',         -- MercadoPago confirmó el pago
  'preparando',
  'enviado',
  'entregado',
  'cancelado'
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  status order_status not null default 'pendiente',
  customer_email text not null,
  customer_name text,
  shipping_address jsonb,
  total_clp int not null check (total_clp >= 0),
  mercadopago_preference_id text,
  mercadopago_payment_id text,
  invoice_document_id text,       -- referencia del DTE emitido (SimpleFactura, etc.)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity int not null check (quantity > 0),
  unit_price_clp int not null check (unit_price_clp >= 0)
);

-- Registro de movimientos de stock — auditoría + evita sobreventa.
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  order_id uuid references orders(id),
  delta int not null,             -- negativo = descuento por venta, positivo = reposición
  reason text not null,           -- 'venta', 'reposicion', 'ajuste'
  created_at timestamptz not null default now()
);

-- ── Función transaccional: confirmar pago y descontar stock atómicamente ──
-- Se llama desde el webhook de MercadoPago (api/webhooks/mercadopago.ts) usando
-- el cliente admin (service role). Evita condiciones de carrera / sobreventa.
create or replace function confirmar_pago_y_descontar_stock(p_order_id uuid, p_payment_id text)
returns void
language plpgsql
security definer
as $$
declare
  item record;
begin
  -- idempotencia: si ya está pagado, no volver a descontar stock
  if exists (select 1 from orders where id = p_order_id and status <> 'pendiente') then
    return;
  end if;

  for item in select product_id, quantity from order_items where order_id = p_order_id loop
    update products
      set stock = stock - item.quantity
      where id = item.product_id and stock >= item.quantity;

    if not found then
      raise exception 'Stock insuficiente para el producto %', item.product_id;
    end if;

    insert into stock_movements (product_id, order_id, delta, reason)
      values (item.product_id, p_order_id, -item.quantity, 'venta');
  end loop;

  update orders
    set status = 'pagado', mercadopago_payment_id = p_payment_id, updated_at = now()
    where id = p_order_id;
end;
$$;

-- ── Row Level Security ──────────────────────────────────────────
alter table categories enable row level security;
alter table products enable row level security;
alter table product_images enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table stock_movements enable row level security;

-- Lectura pública SOLO de catálogo publicado (browser usa la anon key)
create policy "categorías son públicas" on categories for select using (true);
create policy "productos publicados son públicos" on products for select using (is_published = true);
create policy "imágenes de productos publicados son públicas" on product_images for select
  using (exists (select 1 from products p where p.id = product_id and p.is_published = true));

-- orders / order_items / stock_movements: SIN políticas de acceso público.
-- Todo acceso pasa por src/pages/api/** usando la service role key (createSupabaseAdminClient),
-- o por el admin autenticado (a definir: policy adicional para el usuario admin si se
-- quiere leer pedidos desde el panel usando su propia sesión en vez de la service role).
