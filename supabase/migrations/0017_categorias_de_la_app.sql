-- Distinguir las categorías que trae la app de las que agrega cada persona.
-- Correlo después de 0016_planeado_sin_antojos.sql.
--
-- Las categorías siempre fueron de cada usuario: la tabla tiene `user_id`, RLS
-- filtra por él y toda lectura lo repite. Pero la lista de arranque es la misma
-- para todos, así que dos personas ven treinta nombres idénticos sin saber que
-- vinieron con la app. Cuando una crea "Mascota" y la otra ya tenía algo
-- parecido, parece que se copió.
--
-- Con el origen marcado, la pantalla puede decir cuáles son suyas de verdad.

alter table public.categories
  add column if not exists origen text not null default 'usuario'
    check (origen in ('app', 'usuario'));

comment on column public.categories.origen is
  '"app" = vino con la lista de arranque. "usuario" = la agregó esa persona.';

/**
 * La lista de arranque, en un solo lugar.
 *
 * Estaba embebida dentro de `sembrar_categorias` y hacía falta repetirla acá
 * para marcar lo ya existente. Como función, la usan las dos.
 */
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

-- Lo que ya existe y coincide con la lista de arranque vino con la app. El
-- resto lo agregó la persona: por eso el default de la columna es 'usuario'.
update public.categories c
   set origen = 'app'
  from public.categorias_de_la_app() a
 where c.name = a.name and c.type = a.type and c.scope = a.scope;

-- Y de acá en adelante, sembrar marca el origen.
create or replace function public.sembrar_categorias(p_user uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.categories (user_id, name, type, scope, origen)
  select p_user, a.name, a.type, a.scope, 'app'
    from public.categorias_de_la_app() a
  on conflict (user_id, type, scope, name) do nothing;
$$;

notify pgrst, 'reload schema';
