-- Separar la plantilla de la compra real.
-- Correlo después de 0014_monto_pagado.sql.
--
-- El diseño anterior mezclaba dos cosas que no son la misma:
--
--   La LISTA es lo que solés comprar. Sus precios son de referencia y sirven
--   para estimar. Vive en el tiempo y se reusa cada quincena.
--
--   La COMPRA es un evento. Los precios de ese día, las cantidades que
--   realmente entraron al carrito, lo que no había en góndola.
--
-- Con una sola tabla, corregir un precio parado en el súper reescribía la
-- lista base: perdías la referencia justo cuando la usabas. Ahora la compra
-- copia la lista al arrancar y a partir de ahí es independiente.

-- ─── La compra ───────────────────────────────────────────────────────────────

create table if not exists public.shopping_trips (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  ledger_id  uuid references public.ledgers (id) on delete cascade,
  -- De qué lista salió. `on delete set null`: borrar la plantilla no puede
  -- borrar el historial de lo que se gastó.
  list_id    uuid references public.shopping_lists (id) on delete set null,
  name       text not null,
  date       date not null default current_date,
  closed     boolean not null default false,
  paid_amount numeric(14,2) check (paid_amount is null or paid_amount >= 0),
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists shopping_trips_ledger_idx
  on public.shopping_trips (ledger_id, closed, date desc);

create table if not exists public.shopping_trip_items (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.shopping_trips (id) on delete cascade,
  name       text not null,
  category   text not null default 'Otros',
  -- Lo que realmente entró al carrito.
  quantity   numeric(10,3) not null default 1 check (quantity > 0),
  unit       text not null default 'unidad',
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  checked    boolean not null default false,
  -- Lo que decía la lista al arrancar. Null si el artículo se agregó sobre la
  -- marcha. Guardarlo es lo que permite ver "esto subió" sin tocar la plantilla.
  planned_quantity   numeric(10,3),
  planned_unit_price numeric(14,2),
  created_at timestamptz not null default now()
);
create index if not exists shopping_trip_items_trip_idx
  on public.shopping_trip_items (trip_id, category, created_at);

alter table public.shopping_trips      enable row level security;
alter table public.shopping_trip_items enable row level security;

drop policy if exists "propias" on public.shopping_trips;
create policy "propias" on public.shopping_trips for all to authenticated
  using (
    user_id = (select auth.uid())
    or ledger_id in (select c.ledger_id from public.cuentas_visibles((select auth.uid())) c)
  )
  with check (
    user_id = (select auth.uid())
    or ledger_id in (select c.ledger_id from public.cuentas_visibles((select auth.uid())) c)
  );

drop policy if exists "por_compra" on public.shopping_trip_items;
create policy "por_compra" on public.shopping_trip_items for all to authenticated
  using (
    trip_id in (
      select t.id from public.shopping_trips t
       where t.user_id = (select auth.uid())
          or t.ledger_id in (select c.ledger_id from public.cuentas_visibles((select auth.uid())) c)
    )
  )
  with check (
    trip_id in (
      select t.id from public.shopping_trips t
       where t.user_id = (select auth.uid())
          or t.ledger_id in (select c.ledger_id from public.cuentas_visibles((select auth.uid())) c)
    )
  );

-- ─── Mudar lo que ya existía ─────────────────────────────────────────────────
--
-- Toda lista que ya se había cerrado era, en realidad, una compra. Se convierte
-- en una para no perder el gasto ni su detalle.

-- 0014 pudo no haberse corrido nunca. Sin esto, el select de abajo falla con
-- "column paid_amount does not exist" y la migración entera se aborta.
alter table public.shopping_lists add column if not exists paid_amount numeric(14,2);

-- `list_id` apunta al original mientras dura la mudanza: es lo que empareja
-- cada compra con sus artículos sin adivinar por nombre y fecha, que se
-- duplicaría si alguien tuvo dos listas iguales el mismo día. Al borrar las
-- listas más abajo, el `on delete set null` lo deja en null solo.
insert into public.shopping_trips
  (user_id, ledger_id, list_id, name, date, closed, paid_amount, transaction_id, created_at)
select l.user_id, l.ledger_id, l.id, l.name, l.date, true, l.paid_amount, l.transaction_id, l.created_at
  from public.shopping_lists l
 where l.closed = true;

insert into public.shopping_trip_items
  (trip_id, name, category, quantity, unit, unit_price, checked, created_at)
select t.id, i.name, i.category, i.quantity, i.unit, i.unit_price, i.checked, i.created_at
  from public.shopping_items i
  join public.shopping_trips t on t.list_id = i.list_id
 where t.closed = true;

delete from public.shopping_lists where closed = true;

-- ─── La lista vuelve a ser solo una plantilla ────────────────────────────────

alter table public.shopping_lists drop column if exists closed;
alter table public.shopping_lists drop column if exists paid_amount;
alter table public.shopping_lists drop column if exists transaction_id;
alter table public.shopping_lists drop column if exists date;
-- Tildar es de la compra, no de la plantilla: en la lista no significa nada.
alter table public.shopping_items drop column if exists checked;

drop index if exists public.shopping_lists_ledger_idx;
create index if not exists shopping_lists_ledger_idx
  on public.shopping_lists (ledger_id, created_at desc);

-- ─── Totales ─────────────────────────────────────────────────────────────────

/** Lo que costaría la lista entera, a precios de referencia. */
create or replace function public.shopping_list_totals(p_list uuid[])
returns table (list_id uuid, total numeric, items bigint)
language sql stable as $$
  select i.list_id,
         coalesce(sum(i.quantity * i.unit_price), 0)::numeric,
         count(*)::bigint
    from public.shopping_items i
   where i.list_id = any(p_list)
   group by i.list_id
$$;

/** Lo planeado, lo que va en el carrito y cuántos artículos, por compra. */
create or replace function public.shopping_trip_totals(p_trip uuid[])
returns table (
  trip_id uuid, total numeric, checked_total numeric,
  planned_total numeric, items bigint, checked_items bigint
)
language sql stable as $$
  select i.trip_id,
         coalesce(sum(i.quantity * i.unit_price), 0)::numeric,
         coalesce(sum(i.quantity * i.unit_price) filter (where i.checked), 0)::numeric,
         coalesce(sum(coalesce(i.planned_quantity, i.quantity)
                    * coalesce(i.planned_unit_price, i.unit_price)), 0)::numeric,
         count(*)::bigint,
         count(*) filter (where i.checked)::bigint
    from public.shopping_trip_items i
   where i.trip_id = any(p_trip)
   group by i.trip_id
$$;

-- La vieja miraba una columna que ya no existe.
drop function if exists public.shopping_totals(uuid[]);

notify pgrst, 'reload schema';
