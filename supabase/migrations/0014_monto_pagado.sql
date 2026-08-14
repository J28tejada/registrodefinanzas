-- Lo que efectivamente se pagó en la caja.
-- Correlo después de 0013_lista_de_compras.sql.
--
-- La suma de los artículos es una estimación: en la caja aparecen impuestos,
-- una oferta, un precio distinto al de la góndola o algo que se agarró sin
-- anotar. Al cerrar la lista se puede corregir el monto, y guardarlo permite
-- comparar después lo planeado contra lo pagado — que es justamente el control
-- que uno busca sobre el gasto del súper.
--
-- Se guarda acá y no solo en el movimiento: si alguien borra la transacción, la
-- lista tiene que seguir sabiendo cuánto costó esa compra.

alter table public.shopping_lists
  add column if not exists paid_amount numeric(14,2) check (paid_amount is null or paid_amount >= 0);

comment on column public.shopping_lists.paid_amount is
  'Lo pagado en la caja. Null mientras la lista está abierta.';

notify pgrst, 'reload schema';
