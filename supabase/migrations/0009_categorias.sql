-- Categorías propias de cada usuario, en vez de una lista fija en el código.
-- Correlo después de 0008_grupos.sql.
--
-- Hasta acá vivían en lib/types.ts: servían para empezar, pero nadie podía
-- agregar "Mascota" ni renombrar "Otros personal". Ahora cada quien arranca con
-- las mismas de siempre y las cambia si quiere.
--
-- `transactions.category` sigue siendo texto y no una FK a propósito: un
-- movimiento tiene que sobrevivir a que borren su categoría. Lo que cuesta eso
-- es que renombrar hay que propagarlo, y de eso se encarga la app.

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  type       text not null check (type in ('income','expense')),
  scope      text not null check (scope in ('personal','business')),
  created_at timestamptz not null default now(),
  -- Dos "Transporte" de gasto personal serían indistinguibles en el desplegable.
  unique (user_id, type, scope, name)
);
create index if not exists categories_user_idx
  on public.categories (user_id, scope, type, name);

alter table public.categories enable row level security;
drop policy if exists "propias" on public.categories;
create policy "propias" on public.categories for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ─── Las de siempre, como punto de partida ───────────────────────────────────

create or replace function public.sembrar_categorias(p_user uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.categories (user_id, name, type, scope)
  select p_user, name, type, scope
    from (values
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
  on conflict (user_id, type, scope, name) do nothing;
$$;

create or replace function public.sembrar_categorias_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sembrar_categorias(new.id);
  return new;
end $$;

drop trigger if exists sembrar_categorias_trigger on auth.users;
create trigger sembrar_categorias_trigger
  after insert on auth.users
  for each row execute function public.sembrar_categorias_nuevo_usuario();

-- Los que ya estaban
do $$
declare u record;
begin
  for u in select id from auth.users loop
    perform public.sembrar_categorias(u.id);
  end loop;
end $$;

-- Y cualquier categoría que exista en movimientos viejos pero no en la lista:
-- si alguien ya tiene gastos en "Mascota", esa categoría es suya y tiene que
-- aparecer, no desaparecer del desplegable.
insert into public.categories (user_id, name, type, scope)
select distinct t.user_id, t.category, t.type, t.scope
  from public.transactions t
 where t.category is not null and t.category <> ''
on conflict (user_id, type, scope, name) do nothing;

notify pgrst, 'reload schema';
