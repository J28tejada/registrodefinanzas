-- Ícono y color por categoría.
-- Correlo después de 0020_saldo_de_tarjeta.sql.
--
-- Una lista de treinta nombres en texto plano se lee palabra por palabra. Con
-- un ícono al lado, elegir "Alimentación" entre todas pasa a ser reconocer un
-- dibujo, que es bastante más rápido que leer — y es lo que uno hace veinte
-- veces por día al anotar un gasto.
--
-- Los dos van nullable y con respaldo en la app: una categoría sin ícono se
-- dibuja con uno genérico, así que nada se rompe mientras estén vacíos.

alter table public.categories
  -- La clave del ícono, no el dibujo: 'utensilios', 'auto', 'casa'. El catálogo
  -- vive en `lib/iconos-categoria.ts` y acá solo se guarda cuál se eligió.
  add column if not exists icon text,
  -- Uno de los colores de la paleta ('green', 'blue', …). Null = el del tipo:
  -- verde para ingresos, gris para gastos.
  add column if not exists color text;

comment on column public.categories.icon is 'Clave del catálogo de íconos de la app. Null = uno genérico.';
comment on column public.categories.color is 'Color de la paleta. Null = el que corresponda al tipo.';

-- ─── Las de arranque vienen con el suyo ──────────────────────────────────────
--
-- La lista de la app cambia de forma: ahora dice también con qué ícono y color
-- se dibuja cada una. Como cambia el tipo de retorno, hay que tirarla antes:
-- `create or replace` no puede con eso.

drop function if exists public.categorias_de_la_app();

create or replace function public.categorias_de_la_app()
returns table (name text, type text, scope text, icon text, color text)
language sql immutable as $$
  select * from (values
    ('Alimentación','expense','personal','utensilios','orange'),
    ('Transporte','expense','personal','auto','blue'),
    ('Salud','expense','personal','salud','red'),
    ('Entretenimiento','expense','personal','musica','pink'),
    ('Ropa','expense','personal','remera','purple'),
    ('Educación','expense','personal','libro','indigo'),
    ('Servicios básicos','expense','personal','rayo','orange'),
    ('Hogar','expense','personal','casa','teal'),
    ('Suscripciones','expense','personal','repetir','indigo'),
    ('Otros personal','expense','personal','etiqueta',null),
    ('Salario','income','personal','billetes','green'),
    ('Freelance','income','personal','maletin','teal'),
    ('Inversiones','income','personal','tendencia','green'),
    ('Regalo','income','personal','regalo','pink'),
    ('Otros ingreso personal','income','personal','etiqueta',null),
    ('Materiales','expense','business','caja','orange'),
    ('Marketing','expense','business','altavoz','pink'),
    ('Equipo/Tecnología','expense','business','monitor','blue'),
    ('Transporte negocio','expense','business','camion','blue'),
    ('Personal/Empleados','expense','business','personas','purple'),
    ('Oficina','expense','business','edificio','indigo'),
    ('Impuestos','expense','business','recibo','red'),
    ('Servicios negocio','expense','business','herramienta','teal'),
    ('Otros negocio','expense','business','etiqueta',null),
    ('Ventas','income','business','carrito','green'),
    ('Servicios prestados','income','business','maletin','teal'),
    ('Comisiones','income','business','porcentaje','green'),
    ('Proyectos','income','business','carpeta','indigo'),
    ('Otros ingreso negocio','income','business','etiqueta',null)
  ) as d(name, type, scope, icon, color)
$$;

-- Las que ya están cargadas se completan con el ícono que les toca. Solo las
-- que vinieron con la app y solo si no tienen uno: si alguien ya eligió, manda
-- lo que eligió.
update public.categories c
   set icon  = a.icon,
       color = a.color
  from public.categorias_de_la_app() a
 where c.origen = 'app'
   and c.icon is null
   and c.name = a.name
   and c.type = a.type;

-- ─── Un ícono de arranque para las categorías propias ────────────────────────
--
-- Las que agregó el usuario no están en la lista de la app, así que se quedarían
-- todas con el genérico: veinte círculos iguales, y veinte viajes al selector
-- antes de que la función sirva de algo. Se adivina por el nombre.
--
-- Las mismas reglas están en `sugerirIcono()` de `lib/iconos-categoria.ts`, que
-- es la que manda de acá en adelante. Esto corre una sola vez y sobre datos que
-- ya existen: que las dos listas se separen con el tiempo no rompe nada, porque
-- esta no vuelve a usarse.
--
-- El orden importa: gana la primera que coincide. "Pago filmmaker" tiene que dar
-- cámara y no billetes, por eso 'filmmaker' va antes que 'pago'.

-- Estas valen solo como palabra entera. 'plan' por subcadena le ganaría a
-- "Planta" —va antes que la regla de las plantas— y 'gas' pegaría con "Gastos".
with exactas(palabra, icono) as (values
  ('plan', 'wifi'), ('planes', 'wifi'), ('ads', 'altavoz'), ('gas', 'combustible')
),
pistas(orden, patron, icono) as (values
  ( 1, '%filmmaker%', 'camara'), ( 2, '%editor%', 'camara'), ( 3, '%video%', 'camara'),
  ( 4, '%foto%', 'camara'),      ( 5, '%camara%', 'camara'), ( 6, '%media%', 'camara'),
  ( 7, '%combustible%', 'combustible'), ( 8, '%gasolina%', 'combustible'),
  ( 9, '%taller%', 'herramienta'), (10, '%mecanic%', 'herramienta'), (11, '%repuesto%', 'herramienta'),
  (12, '%vehiculo%', 'auto'), (13, '%carro%', 'auto'), (14, '%transporte%', 'auto'),
  (15, '%taxi%', 'auto'),     (16, '%uber%', 'auto'),  (17, '%pasaje%', 'auto'),
  (18, '%viaje%', 'avion'),   (19, '%vacacion%', 'avion'), (20, '%hotel%', 'avion'),
  (21, '%aliment%', 'utensilios'), (22, '%comida%', 'utensilios'), (23, '%super%', 'utensilios'),
  (24, '%mercado%', 'utensilios'), (25, '%restaurant%', 'utensilios'),
  (26, '%cafe%', 'cafe'),
  (27, '%farmac%', 'salud'), (28, '%medic%', 'salud'), (29, '%salud%', 'salud'),
  (30, '%gimnasio%', 'gimnasio'), (31, '%gym%', 'gimnasio'),
  (32, '%barber%', 'tijera'), (33, '%pelu%', 'tijera'),
  (34, '%ropa%', 'remera'), (35, '%zapato%', 'remera'), (36, '%calzado%', 'remera'),
  (37, '%internet%', 'wifi'), (38, '%celular%', 'wifi'), (39, '%telefono%', 'wifi'),
  (40, '%wifi%', 'wifi'),
  (42, '%electric%', 'rayo'), (43, '%energia%', 'rayo'), (44, '%luz%', 'rayo'),
  (45, '%agua%', 'agua'),
  (46, '%renta%', 'casa'), (47, '%alquiler%', 'casa'), (48, '%hogar%', 'casa'), (49, '%casa%', 'casa'),
  (50, '%suscripcion%', 'repetir'), (51, '%netflix%', 'repetir'), (52, '%streaming%', 'repetir'),
  (53, '%cine%', 'cine'), (54, '%pelicula%', 'cine'), (55, '%entreteni%', 'cine'),
  (56, '%musica%', 'musica'), (57, '%juego%', 'juegos'),
  (58, '%educa%', 'libro'), (59, '%escuela%', 'libro'), (60, '%colegio%', 'libro'),
  (61, '%universidad%', 'libro'), (62, '%curso%', 'libro'), (63, '%libro%', 'libro'),
  (64, '%diezmo%', 'iglesia'), (65, '%iglesia%', 'iglesia'), (66, '%ofrenda%', 'iglesia'),
  (67, '%regalo%', 'regalo'), (68, '%cumple%', 'regalo'),
  (69, '%mascota%', 'mascota'), (70, '%veterinar%', 'mascota'),
  (71, '%bebe%', 'bebe'), (72, '%guarderia%', 'bebe'),
  (73, '%planta%', 'planta'), (74, '%jardin%', 'planta'), (75, '%solar%', 'planta'),
  (76, '%marketing%', 'altavoz'), (77, '%publicidad%', 'altavoz'), (78, '%anuncio%', 'altavoz'),
  (80, '%equipo%', 'monitor'), (81, '%tecnolog%', 'monitor'), (82, '%laptop%', 'monitor'),
  (83, '%oficina%', 'edificio'),
  (84, '%empleado%', 'personas'), (85, '%nomina%', 'personas'),
  (86, '%proyecto%', 'carpeta'),
  (87, '%material%', 'caja'), (88, '%insumo%', 'caja'),
  (89, '%impuesto%', 'recibo'), (90, '%itbis%', 'recibo'),
  (91, '%comision%', 'porcentaje'),
  (92, '%venta%', 'carrito'), (93, '%compra%', 'carrito'), (94, '%articulo%', 'carrito'),
  (95, '%inversion%', 'tendencia'), (96, '%dividendo%', 'tendencia'),
  (97, '%ahorro%', 'alcancia'),
  (98, '%banco%', 'banco'), (99, '%prestamo%', 'banco'), (100, '%deuda%', 'banco'),
  (101, '%seguro%', 'escudo'),
  (102, '%freelance%', 'maletin'), (103, '%honorario%', 'maletin'), (104, '%servicio%', 'maletin'),
  (105, '%salario%', 'billetes'), (106, '%sueldo%', 'billetes'), (107, '%pago%', 'billetes'),
  (108, '%aporte%', 'billetes')
),
candidatas as (
  -- `translate` y no `unaccent`: la extensión puede no estar instalada, y para
  -- el español alcanza con cambiar las cinco vocales, la diéresis y la eñe.
  -- Las de palabra entera van con orden 0: ganan siempre.
  select c.id, e.icono, 0 as orden
    from public.categories c
    join exactas e
      on translate(lower(c.name), 'áéíóúüñ', 'aeiouun') ~ ('\m' || e.palabra || '\M')
   where c.origen = 'usuario' and c.icon is null
  union all
  select c.id, p.icono, p.orden
    from public.categories c
    join pistas p
      on translate(lower(c.name), 'áéíóúüñ', 'aeiouun') like p.patron
   where c.origen = 'usuario' and c.icon is null
),
elegida as (
  -- `distinct on` con el orden puesto se queda con la primera que pegó.
  select distinct on (id) id, icono from candidatas order by id, orden
)
update public.categories c
   set icon = e.icono
  from elegida e
 where e.id = c.id;

/** Siembra en una cuenta las de arranque que le corresponden por su tipo. */
create or replace function public.sembrar_categorias_cuenta(p_ledger uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.categories (user_id, ledger_id, name, type, origen, icon, color)
  select l.user_id, l.id, a.name, a.type, 'app', a.icon, a.color
    from public.ledgers l
    join public.categorias_de_la_app() a on a.scope = l.type
   where l.id = p_ledger
     and not exists (
       select 1 from public.categories c
        where c.ledger_id = l.id and c.type = a.type and c.name = a.name
     )
$$;

notify pgrst, 'reload schema';
