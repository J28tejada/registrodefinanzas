-- Listas de compra del supermercado.
-- Correlo después de 0012_tarjetas.sql.
--
-- Es la única parte de la app que mira hacia adelante: todo lo demás anota lo
-- que ya pasó. Acá el gasto se arma antes de hacerlo, que es el momento en que
-- todavía se puede cambiar.
--
-- La lista cuelga de una cuenta y no de una persona: la compra del súper la
-- hacen los dos, uno agrega desde la casa y el otro tilda en el pasillo. Sin
-- eso habría dos listas de lo mismo.

create table if not exists public.shopping_lists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  ledger_id  uuid references public.ledgers (id) on delete cascade,
  name       text not null,
  date       date not null default current_date,
  -- Cerrada = ya se compró. Se guarda en vez de borrarse para poder mirar
  -- cuánto se gastó el mes pasado y con qué.
  closed     boolean not null default false,
  -- El gasto que generó al cerrarse. `on delete set null`: si se borra el
  -- movimiento, la lista sigue existiendo con su historial.
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists shopping_lists_ledger_idx
  on public.shopping_lists (ledger_id, closed, date desc);

create table if not exists public.shopping_items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.shopping_lists (id) on delete cascade,
  name       text not null,
  -- El pasillo, no la categoría contable: "Lácteos" y no "Alimentación". Es lo
  -- que hace que la lista sirva caminando el supermercado.
  category   text not null default 'Otros',
  -- Numérico y no entero: "2.5 libras de carne" es una compra normal.
  quantity   numeric(10,3) not null default 1 check (quantity > 0),
  unit       text not null default 'unidad',
  -- Precio POR UNIDAD. El total es cantidad × precio, y así "3 libras a 80" se
  -- carga como se lee en la góndola.
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  -- Tildado al echarlo al carrito. Lo tildado es lo que suma al total real.
  checked    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists shopping_items_list_idx
  on public.shopping_items (list_id, category, created_at);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Como los presupuestos: propia, o de una cuenta que comparto.

alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;

drop policy if exists "propias" on public.shopping_lists;
create policy "propias" on public.shopping_lists for all to authenticated
  using (
    user_id = (select auth.uid())
    or ledger_id in (select c.ledger_id from public.cuentas_visibles((select auth.uid())) c)
  )
  with check (
    user_id = (select auth.uid())
    or ledger_id in (select c.ledger_id from public.cuentas_visibles((select auth.uid())) c)
  );

-- Los artículos heredan el permiso de su lista: no tienen dueño propio.
drop policy if exists "por_lista" on public.shopping_items;
create policy "por_lista" on public.shopping_items for all to authenticated
  using (
    list_id in (
      select l.id from public.shopping_lists l
       where l.user_id = (select auth.uid())
          or l.ledger_id in (select c.ledger_id from public.cuentas_visibles((select auth.uid())) c)
    )
  )
  with check (
    list_id in (
      select l.id from public.shopping_lists l
       where l.user_id = (select auth.uid())
          or l.ledger_id in (select c.ledger_id from public.cuentas_visibles((select auth.uid())) c)
    )
  );

-- ─── Totales ─────────────────────────────────────────────────────────────────

/**
 * Los totales de cada lista: lo planeado y lo que ya está en el carrito.
 *
 * Va como función porque PostgREST no agrupa, igual que el resto de los
 * agregados del esquema. Devuelve las dos cifras juntas porque la pantalla
 * muestra siempre "vas por X de Y".
 */
create or replace function public.shopping_totals(p_list uuid[])
returns table (
  list_id uuid, total numeric, checked_total numeric,
  items bigint, checked_items bigint
)
language sql stable as $$
  select i.list_id,
         coalesce(sum(i.quantity * i.unit_price), 0)::numeric,
         coalesce(sum(i.quantity * i.unit_price) filter (where i.checked), 0)::numeric,
         count(*)::bigint,
         count(*) filter (where i.checked)::bigint
    from public.shopping_items i
   where i.list_id = any(p_list)
   group by i.list_id
$$;

notify pgrst, 'reload schema';
