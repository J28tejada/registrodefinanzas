-- Tarjetas y medios de pago propios de cada usuario.
-- Correlo después de 0011_presupuestos_por_cuenta.sql.
--
-- Hasta acá `transactions.payment_method` era texto libre que escribía el
-- agente: servía para leerlo en la lista, pero "Visa", "visa" y "tarjeta visa"
-- eran tres cosas distintas y no se podía sumar cuánto va por cada una.
--
-- El texto se mantiene, igual que `category`: un movimiento tiene que
-- sobrevivir a que borren la tarjeta con la que se pagó. La FK se agrega al
-- lado, con `on delete set null`, y renombrar lo propaga la app.

create table if not exists public.cards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  -- Efectivo y transferencia no son tarjetas, pero son medios de pago y van en
  -- el mismo desplegable: separarlos obligaría a dos listas para una decisión.
  kind       text not null default 'credit'
             check (kind in ('credit','debit','cash','transfer','other')),
  -- Los últimos cuatro dígitos, para distinguir dos tarjetas del mismo banco.
  -- Texto y no número: "0042" tiene que conservar los ceros.
  last4      text not null default '' check (last4 = '' or last4 ~ '^[0-9]{4}$'),
  issuer     text not null default '',
  -- Los mismos nombres de color que las cuentas: comparten el mapa de la app.
  color      text not null default 'blue',
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  -- Dos "Visa 4242" serían indistinguibles en el desplegable.
  unique (user_id, name)
);
create index if not exists cards_user_idx on public.cards (user_id, archived, name);

alter table public.cards enable row level security;
drop policy if exists "propias" on public.cards;
create policy "propias" on public.cards for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.transactions
  add column if not exists card_id uuid references public.cards (id) on delete set null;
create index if not exists transactions_card_idx on public.transactions (card_id);

-- ─── Lo que ya había escrito el agente ───────────────────────────────────────
--
-- Cada `payment_method` distinto que exista se vuelve una tarjeta, y los
-- movimientos que lo usaban quedan enlazados. Sin esto la sección arranca vacía
-- y el historial no se puede agrupar por medio de pago.

insert into public.cards (user_id, name, kind)
select distinct t.user_id,
       btrim(t.payment_method),
       case
         when t.payment_method ~* 'efectivo|cash'          then 'cash'
         when t.payment_method ~* 'transferencia|transfer' then 'transfer'
         when t.payment_method ~* 'd[eé]bito|debit'        then 'debit'
         when t.payment_method ~* 'cr[eé]dito|credit'      then 'credit'
         else 'other'
       end
  from public.transactions t
 where t.payment_method is not null
   and btrim(t.payment_method) <> ''
on conflict (user_id, name) do nothing;

update public.transactions t
   set card_id = c.id
  from public.cards c
 where c.user_id = t.user_id
   and c.name = btrim(t.payment_method)
   and t.card_id is null;

-- ─── Gasto por tarjeta ───────────────────────────────────────────────────────

/**
 * Cuánto se pagó con cada tarjeta en el período.
 *
 * Va como función porque PostgREST no agrupa, igual que el resto de los
 * agregados de este esquema. Solo gastos: cobrar un ingreso "con la Visa" no
 * significa nada.
 */
create or replace function public.spent_by_card(
  p_user uuid, p_start date, p_end date
)
returns table (card_id uuid, spent numeric, tx_count bigint)
language sql stable as $$
  select t.card_id, sum(t.amount)::numeric, count(*)::bigint
    from public.transactions t
   where t.user_id = p_user
     and t.card_id is not null
     and t.type = 'expense'
     and t.date >= p_start
     and t.date <= p_end
   group by t.card_id
$$;

notify pgrst, 'reload schema';
