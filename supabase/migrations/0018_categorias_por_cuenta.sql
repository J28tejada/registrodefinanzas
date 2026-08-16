-- Las categorías pasan a ser de la cuenta, no de la persona.
-- Correlo después de 0017_categorias_de_la_app.sql.
--
-- Colgaban del usuario y se separaban por `scope`, que heredaban del TIPO de la
-- cuenta. O sea: dos cuentas personales veían exactamente la misma lista. Una
-- categoría como "Pago Rosaura", que solo tiene sentido en el hogar, aparecía
-- también en la cuenta personal y no había forma de separarlas.
--
-- Ahora cada cuenta tiene su lista. Y como la visibilidad la da la membresía,
-- en una cuenta compartida la lista es una sola para los dos: se acaba el tener
-- que crear la misma categoría dos veces, cada quien en su usuario.
--
-- `scope` desaparece: con la categoría colgando de una cuenta, el ámbito ya lo
-- dice el tipo de esa cuenta. Tenerlo por duplicado solo invita a que se
-- separen y contradigan.

alter table public.categories
  add column if not exists ledger_id uuid references public.ledgers (id) on delete cascade;

-- ─── Repartir lo que existe ──────────────────────────────────────────────────
--
-- Cada categoría se copia a TODAS las cuentas del usuario cuyo tipo coincide
-- con su ámbito: son justamente las cuentas donde hoy aparece. Nadie pierde
-- ninguna, y a partir de ahora cada copia vive su propia vida.

-- La restricción vieja va PRIMERO: es `unique (user_id, type, scope, name)`, así
-- que cada copia parece un duplicado de su original y el insert la descarta en
-- silencio. Dejarla puesta vacía todas las cuentas sin dar un solo error.
alter table public.categories drop constraint if exists categories_user_id_type_scope_name_key;
drop index if exists public.categories_user_idx;

insert into public.categories (user_id, ledger_id, name, type, scope, origen)
select c.user_id, l.id, c.name, c.type, c.scope, c.origen
  from public.categories c
  join public.ledgers l on l.user_id = c.user_id and l.type = c.scope
 where c.ledger_id is null;

-- Las originales ya cumplieron: sus copias están en cada cuenta.
delete from public.categories where ledger_id is null;

-- Una cuenta sin categorías no puede quedar: si el usuario no tenía ninguna del
-- ámbito que le toca, se siembra ahora.
insert into public.categories (user_id, ledger_id, name, type, scope, origen)
select l.user_id, l.id, a.name, a.type, l.type, 'app'
  from public.ledgers l
  join public.categorias_de_la_app() a on a.scope = l.type
 where not exists (select 1 from public.categories c where c.ledger_id = l.id
                     and c.type = a.type and c.name = a.name);

alter table public.categories alter column ledger_id set not null;

-- ─── La unicidad ahora es por cuenta ─────────────────────────────────────────

alter table public.categories drop column if exists scope;

create unique index if not exists categories_ledger_tipo_nombre_idx
  on public.categories (ledger_id, type, name);
create index if not exists categories_ledger_idx
  on public.categories (ledger_id, type, name);

-- ─── RLS: la ve quien tiene acceso a la cuenta ───────────────────────────────

drop policy if exists "propias" on public.categories;
create policy "propias" on public.categories for all to authenticated
  using (ledger_id in (select c.ledger_id from public.cuentas_visibles((select auth.uid())) c))
  with check (ledger_id in (select c.ledger_id from public.cuentas_visibles((select auth.uid())) c));

-- ─── Sembrar pasa a ser por cuenta ───────────────────────────────────────────

/** La lista de arranque, ahora sin ámbito: lo decide el tipo de la cuenta. */
create or replace function public.categorias_de_la_app()
returns table (name text, type text, scope text)
language sql immutable as $$
  select * from (values
    ('Alimentación','expense','personal'),
    ('Transporte','expense','personal'),
    ('Salud','expense','personal'),
    ('Entretenimiento','expense','personal'),
    ('Ropa','expense','personal'),
    ('Educación','expense','personal'),
    ('Servicios básicos','expense','personal'),
    ('Hogar','expense','personal'),
    ('Suscripciones','expense','personal'),
    ('Otros personal','expense','personal'),
    ('Salario','income','personal'),
    ('Freelance','income','personal'),
    ('Inversiones','income','personal'),
    ('Regalo','income','personal'),
    ('Otros ingreso personal','income','personal'),
    ('Materiales','expense','business'),
    ('Marketing','expense','business'),
    ('Equipo/Tecnología','expense','business'),
    ('Transporte negocio','expense','business'),
    ('Personal/Empleados','expense','business'),
    ('Oficina','expense','business'),
    ('Impuestos','expense','business'),
    ('Servicios negocio','expense','business'),
    ('Otros negocio','expense','business'),
    ('Ventas','income','business'),
    ('Servicios prestados','income','business'),
    ('Comisiones','income','business'),
    ('Proyectos','income','business'),
    ('Otros ingreso negocio','income','business')
  ) as d(name, type, scope)
$$;

drop function if exists public.sembrar_categorias(uuid);

/** Siembra en una cuenta las de arranque que le corresponden por su tipo. */
create or replace function public.sembrar_categorias_cuenta(p_ledger uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.categories (user_id, ledger_id, name, type, origen)
  select l.user_id, l.id, a.name, a.type, 'app'
    from public.ledgers l
    join public.categorias_de_la_app() a on a.scope = l.type
   where l.id = p_ledger
  on conflict (ledger_id, type, name) do nothing;
$$;

create or replace function public.sembrar_categorias_nueva_cuenta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sembrar_categorias_cuenta(new.id);
  return new;
end $$;

-- El disparador se muda de `auth.users` a `ledgers`: sembrar dejó de ser algo
-- que pasa al registrarse y pasó a ser algo que pasa al crear una cuenta.
drop trigger if exists sembrar_categorias_trigger on auth.users;
drop function if exists public.sembrar_categorias_nuevo_usuario();

drop trigger if exists sembrar_categorias_cuenta_trigger on public.ledgers;
create trigger sembrar_categorias_cuenta_trigger
  after insert on public.ledgers
  for each row execute function public.sembrar_categorias_nueva_cuenta();

notify pgrst, 'reload schema';
