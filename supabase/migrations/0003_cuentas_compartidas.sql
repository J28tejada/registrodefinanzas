-- Cuentas compartidas: una cuenta puede tener más de una persona.
-- Correlo en el SQL Editor de Supabase después de 0002_canales.sql.
--
-- Hasta acá cada fila era de una sola persona y RLS lo resolvía con
-- `user_id = auth.uid()`. Ahora una cuenta puede tener miembros, y un gasto que
-- registre tu pareja en la cuenta del hogar tiene SU user_id pero vos tenés que
-- poder verlo. Por eso las políticas pasan de mirar el dueño de la fila a mirar
-- la membresía de su cuenta.
--
-- `ledgers.user_id` sigue siendo el DUEÑO. Los miembros viven en ledger_members.

-- ─── Perfiles ────────────────────────────────────────────────────────────────
-- auth.users no es legible desde el cliente, y para mostrar "quién tiene acceso"
-- hace falta el correo y el nombre. Este espejo público es la forma estándar.

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text,
  created_at   timestamptz not null default now()
);

create or replace function public.sync_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name);
  return new;
end $$;

drop trigger if exists sync_profile_trigger on auth.users;
create trigger sync_profile_trigger
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.sync_profile();

-- Los que ya existían antes de esta migración
insert into public.profiles (id, email, display_name)
select u.id,
       u.email,
       coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1))
  from auth.users u
 where u.email is not null
on conflict (id) do nothing;

-- ─── Miembros e invitaciones ─────────────────────────────────────────────────

create table if not exists public.ledger_members (
  ledger_id uuid not null references public.ledgers (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (ledger_id, user_id)
);
create index if not exists ledger_members_user_idx on public.ledger_members (user_id);

-- Código corto que se comparte por WhatsApp. Uno vivo por cuenta: generar otro
-- reemplaza el anterior, así un código viejo filtrado deja de servir.
create table if not exists public.ledger_invites (
  code       text primary key,
  ledger_id  uuid not null references public.ledgers (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists ledger_invites_ledger_idx on public.ledger_invites (ledger_id);

-- Toda cuenta que ya existía queda con su dueño como miembro
insert into public.ledger_members (ledger_id, user_id, role)
select l.id, l.user_id, 'owner' from public.ledgers l
on conflict (ledger_id, user_id) do nothing;

-- ─── Helpers de permisos ─────────────────────────────────────────────────────
-- SECURITY DEFINER a propósito: las políticas de ledgers y transactions
-- consultan ledger_members, y ledger_members tiene su propia RLS. Sin saltarla
-- acá, Postgres entra en recursión infinita al evaluar las políticas.

create or replace function public.es_miembro(p_ledger uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ledger_members
     where ledger_id = p_ledger and user_id = (select auth.uid())
  )
$$;

create or replace function public.es_dueno(p_ledger uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ledgers
     where id = p_ledger and user_id = (select auth.uid())
  )
$$;

/** Cuentas que p_user puede ver: las propias más aquellas donde es miembro. */
create or replace function public.cuentas_visibles(p_user uuid)
returns table (ledger_id uuid)
language sql stable security definer set search_path = public as $$
  select id from public.ledgers where user_id = p_user
  union
  select m.ledger_id from public.ledger_members m where m.user_id = p_user
$$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.profiles        enable row level security;
alter table public.ledger_members  enable row level security;
alter table public.ledger_invites  enable row level security;

-- Perfiles: se ve el propio y el de quienes comparten alguna cuenta con vos.
drop policy if exists "perfiles visibles" on public.profiles;
create policy "perfiles visibles" on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
        from public.ledger_members mio
        join public.ledger_members otro on otro.ledger_id = mio.ledger_id
       where mio.user_id = (select auth.uid())
         and otro.user_id = public.profiles.id
    )
  );

-- Cuentas: el dueño manda; los miembros solo leen.
drop policy if exists "propios" on public.ledgers;
drop policy if exists "cuentas visibles"  on public.ledgers;
drop policy if exists "cuentas del dueno" on public.ledgers;

create policy "cuentas visibles" on public.ledgers for select to authenticated
  using (user_id = (select auth.uid()) or public.es_miembro(id));

create policy "cuentas del dueno" on public.ledgers for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Movimientos: los propios, más los de cualquier cuenta donde soy miembro.
-- Un miembro puede corregir el gasto que cargó el otro: es el punto de
-- compartir la cuenta del hogar.
drop policy if exists "propios" on public.transactions;
drop policy if exists "movimientos visibles"    on public.transactions;
drop policy if exists "movimientos editables"   on public.transactions;
drop policy if exists "movimientos insertables" on public.transactions;

create policy "movimientos visibles" on public.transactions for select to authenticated
  using (
    user_id = (select auth.uid())
    or (ledger_id is not null and public.es_miembro(ledger_id))
  );

-- El user_id que se escribe tiene que ser el de quien inserta: así queda
-- registrado quién lo cargó y nadie puede atribuirle un gasto a otro.
create policy "movimientos insertables" on public.transactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (ledger_id is null or public.es_miembro(ledger_id))
  );

create policy "movimientos editables" on public.transactions for update to authenticated
  using (
    user_id = (select auth.uid())
    or (ledger_id is not null and public.es_miembro(ledger_id))
  )
  with check (ledger_id is null or public.es_miembro(ledger_id));

drop policy if exists "movimientos borrables" on public.transactions;
create policy "movimientos borrables" on public.transactions for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (ledger_id is not null and public.es_miembro(ledger_id))
  );

-- Miembros: los ve quien pertenece a la cuenta. Agrega y quita el dueño;
-- un miembro puede borrar su propia fila, que es "salirse de la cuenta".
drop policy if exists "miembros visibles" on public.ledger_members;
create policy "miembros visibles" on public.ledger_members for select to authenticated
  using (public.es_miembro(ledger_id));

drop policy if exists "miembros administrables" on public.ledger_members;
create policy "miembros administrables" on public.ledger_members for insert to authenticated
  with check (public.es_dueno(ledger_id));

drop policy if exists "miembros removibles" on public.ledger_members;
create policy "miembros removibles" on public.ledger_members for delete to authenticated
  using (
    -- al dueño no se lo saca nunca: sin él la cuenta queda huérfana
    role <> 'owner'
    and (public.es_dueno(ledger_id) or user_id = (select auth.uid()))
  );

-- Invitaciones: solo el dueño las ve y las maneja. Quien recibe el código
-- todavía no es miembro, así que canjea por RPC (abajo), no leyendo la tabla.
drop policy if exists "invitaciones del dueno" on public.ledger_invites;
create policy "invitaciones del dueno" on public.ledger_invites for all to authenticated
  using (public.es_dueno(ledger_id))
  with check (public.es_dueno(ledger_id));

-- ─── Canje de invitaciones ───────────────────────────────────────────────────

/** Muestra a qué cuenta invita un código, sin unirse todavía. */
create or replace function public.ver_invitacion(p_code text)
returns table (ledger_name text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.name, i.expires_at
    from public.ledger_invites i
    join public.ledgers l on l.id = i.ledger_id
   where upper(i.code) = upper(trim(p_code))
     and i.expires_at > now()
$$;

/** Suma a quien llama como miembro de la cuenta del código. */
create or replace function public.aceptar_invitacion(p_code text)
returns table (ledger_id uuid, ledger_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_ledger uuid;
  v_name   text;
  v_exp    timestamptz;
  v_uid    uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  select i.ledger_id, l.name, i.expires_at into v_ledger, v_name, v_exp
    from public.ledger_invites i
    join public.ledgers l on l.id = i.ledger_id
   where upper(i.code) = upper(trim(p_code));

  if v_ledger is null then
    raise exception 'CODIGO_INVALIDO';
  end if;
  if v_exp <= now() then
    raise exception 'CODIGO_EXPIRADO';
  end if;

  insert into public.ledger_members (ledger_id, user_id, role)
  values (v_ledger, v_uid, 'member')
  on conflict (ledger_id, user_id) do nothing;

  return query select v_ledger, v_name;
end $$;

-- ─── Agregados conscientes de membresía ──────────────────────────────────────
-- Antes filtraban por `t.user_id = p_user`, que dejaba fuera lo que carga la
-- otra persona en una cuenta compartida. Ahora miran la cuenta, no el dueño de
-- la fila. Siguen siendo SECURITY INVOKER: si un usuario pasa otro p_user, RLS
-- lo sigue frenando.

create or replace function public.summary_by_category(
  p_user uuid, p_ledger uuid, p_start date, p_end date
)
returns table (category text, type text, total numeric, tx_count bigint)
language sql stable as $$
  select t.category, t.type, sum(t.amount)::numeric, count(*)::bigint
    from public.transactions t
   where (
           t.user_id = p_user
           or t.ledger_id in (select c.ledger_id from public.cuentas_visibles(p_user) c)
         )
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
    -- sin filtrar por t.user_id: en una cuenta compartida el saldo son los
    -- movimientos de todos sus miembros, no solo los míos
    left join public.transactions t on t.ledger_id = l.id
   where l.id in (select c.ledger_id from public.cuentas_visibles(p_user) c)
   group by l.id
$$;

-- Los presupuestos siguen siendo personales: cada quien pone su propio tope.
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

notify pgrst, 'reload schema';
