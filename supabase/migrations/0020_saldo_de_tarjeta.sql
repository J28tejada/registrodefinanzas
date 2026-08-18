-- Saldo de la tarjeta de crédito, con su ciclo de corte y de pago.
-- Correlo después de 0019_cuentas_de_banco.sql.
--
-- Hasta acá una tarjeta era solo una etiqueta sobre el movimiento: servía para
-- saber con qué se pagó, no cuánto se debe. Y sin saldo, la única forma de
-- anotar "le pagué a la Visa" era cargarla como gasto — que cuenta la misma
-- plata dos veces, porque la compra YA se había anotado el día que se hizo.
--
-- La regla que ordena todo esto:
--
--   • La COMPRA con tarjeta es el gasto real. Va en `transactions`, cuenta en el
--     presupuesto y en el total del mes. Eso no cambia.
--   • El PAGO a la tarjeta NO es un gasto: es saldar algo ya contado. Va en
--     `card_payments`, baja el saldo y no toca `transactions`.
--
-- Es la diferencia con `debt_payments`, que sí crea un movimiento: la plata de
-- un préstamo nunca entró como ingreso ni se anotó en qué se gastó, así que
-- ahí el gasto ES la cuota. En la tarjeta el gasto ya está anotado.

-- ─── Lo que define a la tarjeta ──────────────────────────────────────────────
--
-- Todo nullable: una tarjeta que ya existe no tiene por qué quedar rota, y
-- configurar el ciclo es opcional. La pantalla tiene que mostrar igual una
-- tarjeta sin límite ni fechas.

alter table public.cards
  -- El cupo. Contra esto se mide la barra de consumo.
  add column if not exists credit_limit numeric(14,2)
      check (credit_limit is null or credit_limit > 0),
  -- Día del mes en que cierra el estado de cuenta. Se recorta al último día en
  -- los meses cortos: "corte el 31" en febrero es el 28.
  add column if not exists statement_day smallint
      check (statement_day is null or statement_day between 1 and 31),
  -- Día del mes en que vence el pago. Si es anterior o igual al de corte, cae
  -- el mes siguiente: acá lo normal es corte el 25 y pago el 10.
  add column if not exists due_day smallint
      check (due_day is null or due_day between 1 and 31),
  -- Lo que ya se debía cuando la tarjeta entró a la app. Sin esto el saldo
  -- arrancaría en cero y mostraría de menos hasta que pase un ciclo entero.
  add column if not exists opening_balance numeric(14,2) not null default 0,
  -- Desde cuándo cuentan los movimientos. Lo de antes ya está adentro del saldo
  -- inicial; contarlo otra vez lo duplicaría. Null = contar todo.
  add column if not exists opening_date date,
  -- Avisos de corte y de pago, por tarjeta: una que casi no se usa no tiene por
  -- qué avisar todos los meses.
  add column if not exists alerts boolean not null default true;

comment on column public.cards.credit_limit  is 'Cupo de la tarjeta. Null = sin configurar.';
comment on column public.cards.statement_day is 'Día del mes del corte, 1-31. Se recorta en meses cortos.';
comment on column public.cards.due_day       is 'Día del mes del pago, 1-31. Si es <= al de corte, vence el mes siguiente.';
comment on column public.cards.opening_balance is 'Lo que ya se debía al empezar a seguirla acá.';
comment on column public.cards.opening_date  is 'Desde cuándo cuentan los movimientos para el saldo.';

-- ─── Los pagos a la tarjeta ──────────────────────────────────────────────────
--
-- Sin `transaction_id`, y es a propósito: acá está la diferencia con
-- `debt_payments`. Un pago a la tarjeta no genera ningún movimiento porque la
-- compra que lo originó ya está anotada. Enlazarlo a una transacción sería
-- exactamente el doble conteo que esta tabla existe para evitar.

create table if not exists public.card_payments (
  id             uuid primary key default gen_random_uuid(),
  card_id        uuid not null references public.cards (id) on delete cascade,
  -- Además del card_id, igual que en debt_payments: la policy filtra por acá
  -- sin tener que salir a buscar la tarjeta en cada fila.
  user_id        uuid not null references auth.users (id) on delete cascade,
  amount         numeric(14,2) not null check (amount > 0),
  date           date not null,
  -- De dónde salió la plata: la cuenta de ahorro, el efectivo. Opcional, y
  -- `on delete set null` para que borrar esa cuenta no borre el pago.
  source_card_id uuid references public.cards (id) on delete set null,
  notes          text not null default '',
  created_at     timestamptz not null default now()
);
create index if not exists card_payments_card_idx on public.card_payments (card_id, date desc);
create index if not exists card_payments_user_idx on public.card_payments (user_id, date desc);

-- ─── Avisos ya mandados ──────────────────────────────────────────────────────
--
-- El cron puede correr dos veces —un reintento, un deploy— y sin esta tabla el
-- mismo aviso llegaría repetido. La clave incluye `days_before` porque avisar
-- tres días antes y avisar el mismo día son dos avisos distintos del mismo
-- vencimiento, no uno repetido.

create table if not exists public.card_alerts (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null references public.cards (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- 'statement' = fecha de corte, 'due' = fecha de pago.
  kind        text not null check (kind in ('statement','due')),
  -- El día al que apunta el aviso, no el día en que se mandó.
  target_date date not null,
  days_before smallint not null check (days_before between 0 and 30),
  sent_at     timestamptz not null default now(),
  unique (card_id, kind, target_date, days_before)
);
create index if not exists card_alerts_user_idx on public.card_alerts (user_id, sent_at desc);

alter table public.card_payments enable row level security;
alter table public.card_alerts   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['card_payments', 'card_alerts'] loop
    execute format('drop policy if exists "propias" on public.%I', t);
    execute format(
      'create policy "propias" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ─── El saldo ────────────────────────────────────────────────────────────────

/**
 * Saldo de cada tarjeta pedida, y cuánto lleva el ciclo en curso.
 *
 * Va como función porque PostgREST no agrupa, igual que `spent_by_card`. Recibe
 * las fechas de corte ya calculadas en un arreglo paralelo al de tarjetas: el
 * recorte del día 31 a los meses cortos vive en TypeScript, y tenerlo también
 * en SQL sería la misma cuenta escrita dos veces, lista para desincronizarse.
 *
 * Filtra por `p_user` a mano en cada tabla. No es redundante con RLS: el cron de
 * avisos entra con la llave de servicio, que la saltea.
 */
create or replace function public.card_balances(
  p_user uuid, p_cards uuid[], p_cuts date[]
)
returns table (
  card_id       uuid,
  charged       numeric,
  credited      numeric,
  paid          numeric,
  cycle_charged numeric
)
language sql stable as $$
  with pedido as (
    select z.card_id, z.cut,
           -- Antes del saldo inicial no se mira nada: eso ya está adentro.
           coalesce(c.opening_date, '-infinity'::date) as arranque
      from unnest(p_cards, p_cuts) as z(card_id, cut)
      join public.cards c on c.id = z.card_id and c.user_id = p_user
  ),
  movimientos as (
    select p.card_id,
           coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)::numeric as charged,
           -- Un ingreso cargado a la tarjeta es plata que volvió a ella —una
           -- devolución, un reembolso— y baja lo que se debe.
           coalesce(sum(t.amount) filter (where t.type = 'income'), 0)::numeric as credited,
           coalesce(sum(t.amount) filter (
             where t.type = 'expense' and t.date > p.cut
           ), 0)::numeric as cycle_charged
      from pedido p
      left join public.transactions t
        on t.card_id = p.card_id and t.user_id = p_user and t.date >= p.arranque
     group by p.card_id
  ),
  pagos as (
    select p.card_id, coalesce(sum(cp.amount), 0)::numeric as paid
      from pedido p
      left join public.card_payments cp
        on cp.card_id = p.card_id and cp.user_id = p_user and cp.date >= p.arranque
     group by p.card_id
  )
  select m.card_id, m.charged, m.credited, g.paid, m.cycle_charged
    from movimientos m
    join pagos g on g.card_id = m.card_id
$$;

notify pgrst, 'reload schema';
