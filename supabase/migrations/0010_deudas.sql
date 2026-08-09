-- Deudas y préstamos, con sus pagos.
-- Correlo después de 0009_categorias.sql.
--
-- Modelo: una deuda tiene un total y una cuota nominal, pero lo que manda es lo
-- efectivamente pagado. El pago se registra con MONTO, no con un tilde: la
-- cuota es fija en el papel y en la vida real se paga de más o de menos, y con
-- un tilde no habría forma de representar eso. Cuántas cuotas van cubiertas se
-- calcula desde el acumulado.

create table if not exists public.debts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  -- Dónde impacta el gasto al pagar. Null = se elige al registrar cada pago.
  ledger_id          uuid references public.ledgers (id) on delete set null,
  name               text not null,
  -- A quién se le debe. Opcional: "Préstamo del carro" a veces ya lo dice todo.
  creditor           text not null default '',
  total_amount       numeric(14,2) not null check (total_amount > 0),
  installment_amount numeric(14,2) not null check (installment_amount > 0),
  installments       integer not null check (installments > 0),
  -- Mes de la primera cuota: con esto se sabe cuál toca este mes.
  start_date         date not null,
  -- Categoría del gasto que genera cada pago, para que caiga en el presupuesto.
  category           text not null,
  -- Saldada o dada de baja: deja de aparecer entre las activas sin perder el
  -- historial de pagos.
  archived           boolean not null default false,
  notes              text not null default '',
  created_at         timestamptz not null default now()
);
create index if not exists debts_user_idx on public.debts (user_id, archived, created_at);

create table if not exists public.debt_payments (
  id             uuid primary key default gen_random_uuid(),
  debt_id        uuid not null references public.debts (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  amount         numeric(14,2) not null check (amount > 0),
  date           date not null,
  -- El gasto que generó este pago. `on delete set null` a propósito: si se
  -- borra el movimiento, el pago sigue contando para la deuda en vez de
  -- desaparecer y hacer que el saldo salte hacia arriba solo.
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists debt_payments_debt_idx on public.debt_payments (debt_id, date desc);

alter table public.debts         enable row level security;
alter table public.debt_payments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['debts', 'debt_payments'] loop
    execute format('drop policy if exists "propias" on public.%I', t);
    execute format(
      'create policy "propias" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ─── Progreso ────────────────────────────────────────────────────────────────

/**
 * Lo pagado por deuda: en total y en el mes que se pida.
 *
 * Va como función y no como consulta armada en la app porque PostgREST no
 * agrupa, igual que el resto de los agregados de este esquema.
 */
create or replace function public.debt_progress(
  p_user uuid, p_start date, p_end date
)
returns table (debt_id uuid, paid_total numeric, paid_period numeric, payments_count bigint)
language sql stable as $$
  select d.id,
         coalesce(sum(p.amount), 0)::numeric,
         coalesce(sum(p.amount) filter (where p.date >= p_start and p.date <= p_end), 0)::numeric,
         count(p.id)::bigint
    from public.debts d
    left join public.debt_payments p on p.debt_id = d.id and p.user_id = p_user
   where d.user_id = p_user
   group by d.id
$$;

notify pgrst, 'reload schema';
