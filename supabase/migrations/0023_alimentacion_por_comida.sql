-- Alimentación se divide por comida, no por dónde se compró.
-- Correlo después de 0022_subcategorias.sql.
--
-- 0022 le puso Supermercado, Restaurante, Delivery, Café y Colmado: dónde se
-- gastó. Pero eso ya lo dice el medio de pago y, sobre todo, no es la pregunta
-- que uno se hace mirando el mes. "Gasté de más en cenas" es una conclusión;
-- "gasté de más en delivery" es casi la misma información que ya daba el nombre
-- del comercio en la descripción.
--
-- Va como migración nueva y no editando la 0022, que ya corrió en producción.
-- Una migración aplicada es historia: cambiarla haría que una base recién creada
-- y una vieja terminen distintas sin que nada avise.

create or replace function public.subcategorias_de_la_app()
returns table (padre text, type text, name text)
language sql immutable as $$
  select * from (values
    ('Alimentación','expense','Desayuno'),
    ('Alimentación','expense','Almuerzo'),
    ('Alimentación','expense','Merienda'),
    ('Alimentación','expense','Cena'),
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

-- ─── Sacar las viejas, sin perder nada anotado ───────────────────────────────
--
-- Solo las que sembró la app (`origen = 'app'`) y solo si NINGÚN movimiento las
-- usa. Una que alguien ya haya usado se queda: borrarla dejaría movimientos
-- apuntando a un detalle que no existe, que es justo lo que `deleteCategory`
-- impide desde la app. Y lo que el usuario haya agregado a mano no se toca.

delete from public.categories s
 using public.categories p
 where s.parent_id = p.id
   and s.origen = 'app'
   and p.name = 'Alimentación'
   and s.name in ('Supermercado', 'Restaurante', 'Delivery', 'Café', 'Colmado')
   and not exists (
     select 1 from public.transactions t
      where t.ledger_id = s.ledger_id
        and t.category = p.name
        and t.subcategory = s.name
   );

-- Y poner las nuevas en cada cuenta. `sembrar_subcategorias_cuenta` ya saltea
-- las que existan, así que corre sobre todas sin duplicar nada.
select public.sembrar_subcategorias_cuenta(l.id) from public.ledgers l;

notify pgrst, 'reload schema';
