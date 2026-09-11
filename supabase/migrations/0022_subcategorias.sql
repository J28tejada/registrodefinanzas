-- Subcategorías: un nivel más bajo de la misma tabla.
-- Correlo después de 0021_categorias_con_icono.sql.
--
-- "Alimentación" contesta en qué rubro se fue la plata, pero no si fue el súper,
-- un delivery o una cena afuera. Esas tres cosas se recortan distinto cuando hay
-- que recortar, y con una sola etiqueta no se distinguen.
--
-- No es una tabla nueva: una subcategoría ES una categoría que cuelga de otra.
-- Mismo nombre, mismo ícono, mismo color, mismas reglas de permisos. Una tabla
-- aparte sería la misma estructura escrita dos veces, y cada cosa que se le
-- agregue a una habría que acordarse de agregársela a la otra.
--
-- Elegir subcategoría es siempre OPCIONAL. Un gasto con categoría y sin
-- subcategoría es un gasto completo, no uno a medio anotar: obligar al segundo
-- nivel convertiría cada registro en dos decisiones en vez de una.

alter table public.categories
  add column if not exists parent_id uuid references public.categories (id) on delete cascade;

comment on column public.categories.parent_id is
  'La categoría de la que cuelga. Null = es una principal.';

create index if not exists categories_parent_idx on public.categories (parent_id, name);

-- ─── La unicidad baja un nivel ───────────────────────────────────────────────
--
-- Antes el nombre era único por (cuenta, tipo). Ahora tiene que serlo por
-- (cuenta, tipo, de quién cuelga): "Otros" puede existir bajo Alimentación y
-- bajo Transporte sin ser el mismo "Otros".
--
-- El `coalesce` no es decorativo: en un índice único Postgres considera que dos
-- NULL son distintos, así que sin él se podrían crear dos categorías
-- principales con el mismo nombre —justo lo que el índice viejo impedía—.

drop index if exists public.categories_ledger_tipo_nombre_idx;
create unique index if not exists categories_ledger_tipo_padre_nombre_idx
  on public.categories (
    ledger_id, type,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    name
  );

-- ─── El movimiento la anota al lado de la categoría ──────────────────────────
--
-- Texto y no una referencia, igual que `category`: un movimiento tiene que
-- sobrevivir a que borren la subcategoría con la que se anotó. Renombrar lo
-- propaga la app, como ya hace con la categoría.

alter table public.transactions
  add column if not exists subcategory text;

comment on column public.transactions.subcategory is
  'Subcategoría elegida, o null. Siempre dentro de `category`.';

create index if not exists transactions_subcategory_idx
  on public.transactions (ledger_id, category, subcategory);

-- ─── Las que trae la app ─────────────────────────────────────────────────────
--
-- Colgadas de las categorías de arranque, por nombre. Son un punto de partida
-- editable, no una lista cerrada: se borran y se agregan como cualquier otra.
--
-- Sin ícono propio: hereda el de su categoría al dibujarse. Setenta íconos para
-- elegir en el primer nivel ya es bastante decisión; en el segundo, el nombre
-- alcanza.

create or replace function public.subcategorias_de_la_app()
returns table (padre text, type text, name text)
language sql immutable as $$
  select * from (values
    ('Alimentación','expense','Supermercado'),
    ('Alimentación','expense','Restaurante'),
    ('Alimentación','expense','Delivery'),
    ('Alimentación','expense','Café'),
    ('Alimentación','expense','Colmado'),
    ('Transporte','expense','Combustible'),
    ('Transporte','expense','Taxi / Uber'),
    ('Transporte','expense','Transporte público'),
    ('Transporte','expense','Peaje'),
    ('Transporte','expense','Mantenimiento'),
    ('Salud','expense','Farmacia'),
    ('Salud','expense','Consulta médica'),
    ('Salud','expense','Laboratorio'),
    ('Salud','expense','Seguro médico'),
    ('Entretenimiento','expense','Cine'),
    ('Entretenimiento','expense','Salidas'),
    ('Entretenimiento','expense','Streaming'),
    ('Entretenimiento','expense','Juegos'),
    ('Ropa','expense','Ropa'),
    ('Ropa','expense','Calzado'),
    ('Ropa','expense','Accesorios'),
    ('Educación','expense','Matrícula'),
    ('Educación','expense','Libros'),
    ('Educación','expense','Cursos'),
    ('Servicios básicos','expense','Luz'),
    ('Servicios básicos','expense','Agua'),
    ('Servicios básicos','expense','Gas'),
    ('Servicios básicos','expense','Internet'),
    ('Servicios básicos','expense','Teléfono'),
    ('Servicios básicos','expense','Basura'),
    ('Hogar','expense','Alquiler'),
    ('Hogar','expense','Mantenimiento'),
    ('Hogar','expense','Muebles'),
    ('Hogar','expense','Limpieza'),
    ('Suscripciones','expense','Streaming'),
    ('Suscripciones','expense','Software'),
    ('Suscripciones','expense','Membresías'),
    ('Salario','income','Sueldo'),
    ('Salario','income','Horas extra'),
    ('Salario','income','Bonificación'),
    ('Freelance','income','Proyecto'),
    ('Freelance','income','Consultoría'),
    ('Inversiones','income','Dividendos'),
    ('Inversiones','income','Intereses'),
    ('Materiales','expense','Insumos'),
    ('Materiales','expense','Mercancía'),
    ('Marketing','expense','Publicidad paga'),
    ('Marketing','expense','Diseño'),
    ('Marketing','expense','Contenido'),
    ('Equipo/Tecnología','expense','Equipos'),
    ('Equipo/Tecnología','expense','Software'),
    ('Equipo/Tecnología','expense','Reparación'),
    ('Personal/Empleados','expense','Sueldos'),
    ('Personal/Empleados','expense','Honorarios'),
    ('Oficina','expense','Alquiler'),
    ('Oficina','expense','Servicios'),
    ('Oficina','expense','Papelería'),
    ('Ventas','income','Productos'),
    ('Ventas','income','Servicios'),
    ('Servicios prestados','income','Por hora'),
    ('Servicios prestados','income','Por proyecto')
  ) as d(padre, type, name)
$$;

/**
 * Siembra en una cuenta las subcategorías de arranque que le corresponden.
 *
 * Aparte de `sembrar_categorias_cuenta` y no adentro: las principales tienen que
 * existir antes de que nada pueda colgar de ellas, y así esta se puede volver a
 * correr sobre una cuenta vieja sin tocar el primer nivel.
 */
create or replace function public.sembrar_subcategorias_cuenta(p_ledger uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.categories (user_id, ledger_id, name, type, origen, parent_id)
  select p.user_id, p.ledger_id, s.name, s.type, 'app', p.id
    from public.subcategorias_de_la_app() s
    join public.categories p
      on p.ledger_id = p_ledger
     and p.parent_id is null
     and p.type = s.type
     and p.name = s.padre
   where not exists (
     select 1 from public.categories c
      where c.parent_id = p.id and c.name = s.name
   )
$$;

-- Las cuentas que ya existen las reciben ahora.
select public.sembrar_subcategorias_cuenta(l.id) from public.ledgers l;

/** Al crear una cuenta se siembran los dos niveles, no solo el primero. */
create or replace function public.sembrar_categorias_cuenta_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sembrar_categorias_cuenta(new.id);
  perform public.sembrar_subcategorias_cuenta(new.id);
  return new;
end $$;

drop trigger if exists sembrar_categorias_cuenta_trigger on public.ledgers;
create trigger sembrar_categorias_cuenta_trigger
  after insert on public.ledgers
  for each row execute function public.sembrar_categorias_cuenta_trigger();

notify pgrst, 'reload schema';
