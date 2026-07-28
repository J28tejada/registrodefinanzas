-- Esquema completo de la app sobre Supabase.
-- Correlo tal cual en el SQL Editor del proyecto (Database → SQL Editor).
--
-- Todo cuelga de auth.users: cada fila lleva user_id y RLS impide ver o tocar
-- lo ajeno. El agente de WhatsApp entra con la service role (que salta RLS) y
-- resuelve el usuario a partir del teléfono vinculado.

-- ─── Configuración regional del usuario ──────────────────────────────────────

create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  currency    text not null default 'DOP',
  locale      text not null default 'es-DO',
  timezone    text not null default 'America/Santo_Domingo',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── Cuentas ─────────────────────────────────────────────────────────────────

create table if not exists public.ledgers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  color       text not null default 'green',
  type        text not null default 'personal' check (type in ('personal','business')),
  description text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists ledgers_user_idx on public.ledgers (user_id, created_at);

-- ─── Movimientos ─────────────────────────────────────────────────────────────

create table if not exists public.transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  ledger_id      uuid references public.ledgers (id) on delete set null,
  type           text not null check (type in ('income','expense')),
  scope          text not null check (scope in ('personal','business')),
  amount         numeric(14,2) not null check (amount > 0),
  category       text not null,
  description    text not null,
  date           date not null,
  -- 'manual' | 'voice' | 'ai' | 'whatsapp'. NULL nunca: siempre se sabe de dónde salió.
  source         text not null default 'manual',
  -- Ruta del comprobante en el bucket `receipts`, si nació de una foto.
  receipt_url    text,
  payment_method text,
  created_at     timestamptz not null default now()
);
create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc, created_at desc);
create index if not exists transactions_ledger_idx on public.transactions (ledger_id);

-- ─── Presupuestos ────────────────────────────────────────────────────────────
-- Un tope mensual por categoría: el mismo monto aplica todos los meses.

create table if not exists public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  category    text not null,
  amount      numeric(14,2) not null check (amount > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, category)
);

-- ─── Gmail ───────────────────────────────────────────────────────────────────

create table if not exists public.email_connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users (id) on delete cascade,
  email         text not null,
  access_token  text not null,
  refresh_token text,
  token_expiry  bigint,
  created_at    timestamptz not null default now()
);

-- ─── WhatsApp ────────────────────────────────────────────────────────────────

-- El teléfono identifica a la PERSONA: un número pertenece a un solo usuario.
create table if not exists public.whatsapp_numbers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  phone       text not null unique,
  ledger_id   uuid references public.ledgers (id) on delete set null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Códigos de un solo uso que el usuario ve en la app y manda por WhatsApp.
create table if not exists public.whatsapp_link_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  code        text not null unique,
  ledger_id   uuid references public.ledgers (id) on delete set null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- Bitácora del chat: de acá sale el contexto del agente.
create table if not exists public.whatsapp_messages (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete cascade,
  phone         text not null,
  wa_message_id text,
  direction     text not null check (direction in ('in','out')),
  body          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists whatsapp_messages_phone_idx on public.whatsapp_messages (phone, created_at desc);
-- Evolution reintenta los webhooks: sin esto un mismo "sí" se procesa dos veces.
-- Sin WHERE a propósito: PostgREST necesita un índice total para poder usarlo
-- como destino de ON CONFLICT. Los NULL no chocan entre sí, así que los
-- mensajes salientes (sin id de WhatsApp) conviven sin problema.
create unique index if not exists whatsapp_messages_wa_id_idx
  on public.whatsapp_messages (wa_message_id);

-- Acciones esperando confirmación. Las herramientas del agente no escriben:
-- dejan una fila acá y el código la aplica cuando el usuario confirma.
create table if not exists public.pending_actions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  phone       text not null,
  kind        text not null,
  payload     jsonb not null,
  summary     text not null default '',
  status      text not null default 'pending'
              check (status in ('pending','confirmed','cancelled','expired')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz
);
-- Una sola pendiente viva por teléfono: con dos, un "sí" sería ambiguo.
create unique index if not exists pending_actions_one_live_per_phone
  on public.pending_actions (phone) where status = 'pending';

-- ─── Agregados ───────────────────────────────────────────────────────────────
-- PostgREST no agrupa, así que los GROUP BY viven acá. Son SECURITY INVOKER
-- (el default): para un usuario autenticado, RLS filtra a sus propias filas
-- aunque pase otro p_user; la service role sí puede consultar por usuario.

create or replace function public.summary_by_category(
  p_user uuid, p_ledger uuid, p_start date, p_end date
)
returns table (category text, type text, total numeric, tx_count bigint)
language sql stable as $$
  select t.category, t.type, sum(t.amount)::numeric, count(*)::bigint
    from public.transactions t
   where t.user_id = p_user
     and (p_ledger is null or t.ledger_id = p_ledger)
     and (p_start is null or t.date >= p_start)
     and (p_end is null or t.date <= p_end)
   group by t.category, t.type
   order by 3 desc
$$;

create or replace function public.ledger_stats(p_user uuid)
returns table (ledger_id uuid, tx_count bigint, balance numeric)
language sql stable as $$
  select l.id,
         count(t.id)::bigint,
         coalesce(sum(case when t.type = 'income' then t.amount else -t.amount end), 0)::numeric
    from public.ledgers l
    left join public.transactions t on t.ledger_id = l.id and t.user_id = l.user_id
   where l.user_id = p_user
   group by l.id
$$;

-- Gasto del período por categoría, para el progreso de los presupuestos.
create or replace function public.spent_by_category(
  p_user uuid, p_start date, p_end date
)
returns table (category text, spent numeric)
language sql stable as $$
  select t.category, sum(t.amount)::numeric
    from public.transactions t
   where t.user_id = p_user
     and t.type = 'expense'
     and t.date >= p_start
     and t.date <= p_end
   group by t.category
$$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.user_settings       enable row level security;
alter table public.ledgers             enable row level security;
alter table public.transactions        enable row level security;
alter table public.budgets             enable row level security;
alter table public.email_connections   enable row level security;
alter table public.whatsapp_numbers    enable row level security;
alter table public.whatsapp_link_codes enable row level security;
alter table public.whatsapp_messages   enable row level security;
alter table public.pending_actions     enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'user_settings', 'ledgers', 'transactions', 'budgets', 'email_connections',
    'whatsapp_numbers', 'whatsapp_link_codes', 'whatsapp_messages', 'pending_actions'
  ] loop
    execute format('drop policy if exists "propios" on public.%I', t);
    execute format(
      'create policy "propios" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ─── Storage de comprobantes ─────────────────────────────────────────────────
-- Bucket privado. Las rutas son "<user_id>/<archivo>", y esa primera carpeta es
-- lo que separa a un usuario de otro.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "recibos propios" on storage.objects;
create policy "recibos propios" on storage.objects for all to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- PostgREST cachea el esquema: sin esto, las funciones nuevas pueden tardar en
-- aparecer y las llamadas .rpc() devuelven 404.
notify pgrst, 'reload schema';
