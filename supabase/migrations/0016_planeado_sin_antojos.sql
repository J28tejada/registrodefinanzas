-- Lo que no estaba en la lista no cuenta como planeado.
-- Correlo después de 0015_compras_separadas_de_listas.sql.
--
-- `shopping_trip_totals` calculaba lo planeado con
-- `coalesce(planned_quantity, quantity) * coalesce(planned_unit_price, unit_price)`.
-- El coalesce era defensivo, pero hace que un artículo agregado en el súper
-- —que por definición NO estaba planeado— sume a lo planeado exactamente lo que
-- costó. O sea: cada compra por impulso infla el plan en su propio monto y el
-- desvío no se mueve.
--
-- Medido: sobre una compra con 310 de ahorro, agregar 710 en antojos dejaba el
-- desvío en 310. Los antojos son justamente lo que uno quiere ver.
--
-- Ahora lo no planeado aporta cero al plan, y además se devuelve aparte: es el
-- número que dice cuánto se fue en cosas que no ibas a comprar.

-- `create or replace` no puede cambiar el tipo de retorno y la firma gana dos
-- columnas, así que hay que soltarla primero.
drop function if exists public.shopping_trip_totals(uuid[]);

create function public.shopping_trip_totals(p_trip uuid[])
returns table (
  trip_id uuid, total numeric, checked_total numeric,
  planned_total numeric, unplanned_total numeric,
  items bigint, checked_items bigint, unplanned_items bigint
)
language sql stable as $$
  select i.trip_id,
         coalesce(sum(i.quantity * i.unit_price), 0)::numeric,
         coalesce(sum(i.quantity * i.unit_price) filter (where i.checked), 0)::numeric,
         -- Solo lo que venía de la lista. Sin planear = 0, no su propio precio.
         coalesce(sum(coalesce(i.planned_quantity, 0)
                    * coalesce(i.planned_unit_price, 0)), 0)::numeric,
         -- Lo que se agarró sobre la marcha y sí entró al carrito.
         coalesce(sum(i.quantity * i.unit_price)
                  filter (where i.checked and i.planned_quantity is null), 0)::numeric,
         count(*)::bigint,
         count(*) filter (where i.checked)::bigint,
         count(*) filter (where i.checked and i.planned_quantity is null)::bigint
    from public.shopping_trip_items i
   where i.trip_id = any(p_trip)
   group by i.trip_id
$$;

notify pgrst, 'reload schema';
