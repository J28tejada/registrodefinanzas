-- Lo que tiene que cumplir la importación de estados de cuenta (0024).
--
-- Datos inventados de punta a punta: este repo es público, y ningún nombre,
-- número de cuenta ni monto sale de un estado de cuenta real.
--
-- Corre con `npm run migraciones`, sobre una base recién migrada. Cada caso
-- comprueba con `assert` e imprime su ✓; el primero que falla corta todo
-- (ON_ERROR_STOP) con el motivo. Las importaciones corren como el rol
-- `authenticated` con un usuario "conectado", igual que desde PostgREST: RLS
-- aplica de verdad, que es lo que el teléfono tiene como única protección.

\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- ─── Los datos ───────────────────────────────────────────────────────────────
-- Ana (a) importa; Beto (b) es otra persona, con su propia cuenta de ahorro
-- que casualmente termina igual. Los dos tienen su cuenta personal y sus
-- categorías porque las crea el alta del usuario (0005, 0017).

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@prueba.invalid'),
  ('00000000-0000-0000-0000-00000000000b', 'beto@prueba.invalid');

insert into public.cards (id, user_id, name, kind, last4, issuer) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Ahorro prueba', 'savings', '3456', 'Banco Ejemplo'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'Visa prueba', 'credit', '1111', 'Banco Ejemplo'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', 'Ahorro de Beto', 'savings', '3456', 'Banco Ejemplo');

-- Lo que cada uno ya había anotado a mano.
insert into public.transactions (id, user_id, ledger_id, type, scope, amount, category, description, date, source) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   (select id from public.ledgers where user_id = '00000000-0000-0000-0000-00000000000a' limit 1),
   'expense', 'personal', 40, 'Transporte', 'metro', '2026-09-03', 'whatsapp'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b',
   (select id from public.ledgers where user_id = '00000000-0000-0000-0000-00000000000b' limit 1),
   'expense', 'personal', 120, 'Ropa', 'de Beto', '2026-08-20', 'manual');

set role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false); end $$;

/*
 * El estado de cuenta de Ana, entero: 10.000,00 de apertura y 11 líneas que
 * cuadran al centavo hasta 12.750,00. Hay de todo lo que la importación sabe
 * hacer: gastos, un ingreso, una compra con su devolución en el mismo estado,
 * una línea que ya estaba anotada, un pago de tarjeta, un retiro que no se
 * anota, dos sin decidir, y dos líneas gemelas (-40, +40, -40 el mismo día:
 * la primera y la tercera tienen fecha, monto y saldo iguales).
 */
create function pg_temp.lin() returns jsonb language sql immutable as $$ select '[
 {"posted":"2026-09-01","date":"2026-08-31","cents":-150000,"balance":850000,"kind":"purchase","decision":"expense","category":"Alimentación","description":"Super ejemplo","match_key":"super ejemplo"},
 {"posted":"2026-09-02","date":"2026-09-02","cents":-10000,"balance":840000,"kind":"purchase","decision":"expense","net_cents":2000,"category":"Otros personal","description":"Tienda ejemplo (con devolución)","match_key":"tienda ejemplo"},
 {"posted":"2026-09-03","date":"2026-09-03","cents":-4000,"balance":836000,"kind":"purchase","decision":"linked","transaction_id":"30000000-0000-0000-0000-000000000001","match_key":"metro"},
 {"posted":"2026-09-05","date":"2026-09-05","cents":8000,"balance":844000,"kind":"refund","decision":"netted","nets_key":"2026-09-02|-10000|840000|0","match_key":"tienda ejemplo"},
 {"posted":"2026-09-05","date":"2026-09-05","cents":-50000,"balance":794000,"kind":"transfer_out","decision":"card_payment","credit_card_id":"10000000-0000-0000-0000-000000000002","match_key":"a:1111"},
 {"posted":"2026-09-07","date":"2026-09-07","cents":-20000,"balance":774000,"kind":"withdrawal","decision":"skipped","match_key":""},
 {"posted":"2026-09-08","date":"2026-09-08","cents":500000,"balance":1274000,"kind":"deposit","decision":"pending","match_key":"dep:acte"},
 {"posted":"2026-09-09","date":"2026-09-09","cents":-4000,"balance":1270000,"kind":"purchase","decision":"expense","category":"Transporte","subcategory":"Transporte público","description":"Metro","match_key":"metro"},
 {"posted":"2026-09-09","date":"2026-09-09","cents":4000,"balance":1274000,"kind":"transfer_in","decision":"income","category":"Otros ingreso personal","description":"Transferencia de ··9876","match_key":"de:9876"},
 {"posted":"2026-09-09","date":"2026-09-09","cents":-4000,"balance":1270000,"kind":"purchase","decision":"expense","category":"Transporte","subcategory":"Transporte público","description":"Metro","match_key":"metro"},
 {"posted":"2026-09-10","date":"2026-09-10","cents":5000,"balance":1275000,"kind":"refund","decision":"pending","match_key":"otra tienda"}
]'::jsonb $$;

-- La cabecera, en la cuenta personal de quien esté "conectado".
create function pg_temp.cab() returns jsonb language sql stable as $$
  select jsonb_build_object('bank', 'popular', 'last4', '3456',
    'ledger_id', (select id from public.ledgers where user_id = auth.uid() limit 1),
    'account_card_id', '10000000-0000-0000-0000-000000000001',
    'opening_cents', 1000000, 'closing_cents', 1275000, 'line_count', 11) $$;

-- La línea `i` del lote con algunos campos cambiados.
create function pg_temp.con(p_i int, p_cambios jsonb) returns jsonb language sql immutable as $$
  select jsonb_set(pg_temp.lin(), array[p_i::text], (pg_temp.lin() -> p_i) || p_cambios) $$;

/*
 * Importa esperando que falle con `p_codigo`. Si pasa, o falla con otro
 * código, el caso falla. Lo que la importación haya llegado a escribir se
 * deshace con el subbloque, igual que en una llamada de verdad que tira.
 */
create function pg_temp.espera_error(p_cab jsonb, p_lin jsonb, p_codigo text) returns void
language plpgsql as $$
declare v_paso boolean := false;
begin
  begin
    perform public.importar_estado_de_cuenta(p_cab, p_lin);
    v_paso := true;
  exception when others then
    if sqlerrm <> p_codigo then raise exception 'esperaba %, salió: %', p_codigo, sqlerrm; end if;
  end;
  if v_paso then raise exception 'esperaba %, y la importación pasó', p_codigo; end if;
end $$;

-- Lo que hay escrito, para comparar antes y después.
create function pg_temp.conteo() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'lineas', (select count(*) from public.statement_lines),
    'importados', (select count(*) from public.transactions where source = 'statement'),
    'pagos', (select count(*) from public.card_payments)) $$;

do $$ begin
  -- Sin estas, los casos de categoría y de neto probarían otra cosa.
  assert exists (select 1 from public.categories c join public.ledgers l on l.id = c.ledger_id
                  where l.user_id = auth.uid() and c.parent_id is null and c.name = 'Transporte' and c.type = 'expense'),
    'la cuenta personal no tiene Transporte como gasto';
  assert exists (select 1 from public.categories c join public.ledgers l on l.id = c.ledger_id
                  where l.user_id = auth.uid() and c.parent_id is null and c.name = 'Otros ingreso personal'
                    and c.type = 'income'),
    'la cuenta personal no tiene Otros ingreso personal como ingreso';
  assert pg_temp.conteo() = '{"lineas":0,"importados":0,"pagos":0}', 'la base no arrancó vacía';
end $$;
\echo '✓ datos inventados de Ana y de Beto'

-- ─── Lo que se rechaza entero ───────────────────────────────────────────────

do $$ begin
  perform pg_temp.espera_error(pg_temp.cab(), jsonb_set(pg_temp.lin(), '{0,balance}', '850001'), 'NO_CUADRA');
end $$;
\echo '✓ un centavo de diferencia en la cadena de saldos: NO_CUADRA'

do $$ begin
  perform pg_temp.espera_error(pg_temp.cab(), pg_temp.con(8, '{"category":"Transporte"}'), 'CATEGORIA_INVALIDA');
end $$;
\echo '✓ un ingreso con una categoría de gasto: CATEGORIA_INVALIDA'

do $$ begin
  perform pg_temp.espera_error(pg_temp.cab(), pg_temp.con(7, '{"subcategory":"Inventada"}'), 'CATEGORIA_INVALIDA');
end $$;
\echo '✓ una subcategoría que la categoría no tiene: CATEGORIA_INVALIDA'

do $$ begin
  perform pg_temp.espera_error(pg_temp.cab(), pg_temp.con(3, '{"decision":"pending"}'), 'NETO_INVALIDO');
end $$;
\echo '✓ una compra por su neto sin la línea de su devolución: NETO_INVALIDO'

do $$ begin
  perform pg_temp.espera_error(pg_temp.cab(),
    pg_temp.con(10, '{"decision":"netted","subtract_from":"30000000-0000-0000-0000-000000000001"}'),
    'NETO_INVALIDO');
end $$;
\echo '✓ una devolución que quiere restarle a un gasto ya anotado: NETO_INVALIDO'

do $$ begin
  perform pg_temp.espera_error(pg_temp.cab(),
    pg_temp.con(4, '{"credit_card_id":"10000000-0000-0000-0000-000000000001"}'), 'TARJETA_INVALIDA');
end $$;
\echo '✓ un pago de tarjeta a una cuenta de ahorro: TARJETA_INVALIDA'

do $$ begin
  perform pg_temp.espera_error(pg_temp.cab(), pg_temp.con(6, '{"decision":"expense","category":"Transporte"}'),
    'SIGNO_INVALIDO');
end $$;
\echo '✓ un depósito anotado como gasto: SIGNO_INVALIDO'

do $$ begin
  perform pg_temp.espera_error(pg_temp.cab(), pg_temp.con(4, '{"decision":"debt_payment"}'), 'DECISION_INVALIDA');
end $$;
\echo '✓ una cuota de deuda, que esta versión no importa: DECISION_INVALIDA'

do $$ begin
  perform pg_temp.espera_error(pg_temp.cab(), pg_temp.con(0, '{"date":"2026-09-02"}'), 'FECHA_INVALIDA');
end $$;
\echo '✓ una compra posterior a cuando el banco la asentó: FECHA_INVALIDA'

do $$ begin
  perform pg_temp.espera_error(pg_temp.cab(),
    pg_temp.con(0, '{"decision":"linked","transaction_id":"30000000-0000-0000-0000-000000000001"}'), 'YA_ENLAZADO');
end $$;
\echo '✓ dos líneas contra el mismo movimiento ya anotado: YA_ENLAZADO'

do $$ begin
  perform pg_temp.espera_error(pg_temp.cab(),
    pg_temp.con(2, '{"transaction_id":"30000000-0000-0000-0000-000000000003"}'), 'MOVIMIENTO_INVALIDO');
end $$;
\echo '✓ enlazar con un movimiento de otra persona, que RLS no deja ver: MOVIMIENTO_INVALIDO'

do $$ begin
  perform pg_temp.espera_error(
    jsonb_set(pg_temp.cab(), '{account_card_id}', '"10000000-0000-0000-0000-000000000003"'),
    pg_temp.lin(), 'CUENTA_INVALIDA');
end $$;
\echo '✓ la cuenta de ahorro de otra persona: CUENTA_INVALIDA'

do $$ begin
  assert pg_temp.conteo() = '{"lineas":0,"importados":0,"pagos":0}',
    format('un error dejó algo escrito: %s', pg_temp.conteo());
  assert (select amount from public.transactions where id = '30000000-0000-0000-0000-000000000001') = 40,
    'un error tocó un movimiento que ya estaba';
end $$;
\echo '✓ después de todos esos errores no quedó nada escrito'

-- ─── La primera importación ─────────────────────────────────────────────────

create temp table imp1 as select public.importar_estado_de_cuenta(pg_temp.cab(), pg_temp.lin()) as r;

do $$
declare
  r jsonb := (select r from imp1);
  v_compra uuid; v_neta uuid; v_gemela0 uuid; v_gemela1 uuid;
begin
  -- 5 creados (super, tienda por su neto, metro ×2, la transferencia que
  -- entra); 2 enlazados (el metro que ya estaba y la devolución); 1 pago; el
  -- retiro omitido. Las dos sin decidir no cuentan ni se guardan.
  assert r - 'import_id' = '{"creados":5,"enlazados":2,"pagos":1,"omitidos":1,"ya_estaban":0}',
    format('la primera importación dio %s', r);
  assert (select count(*) from public.statement_lines) = 9, 'tenían que quedar 9 líneas';
  assert not exists (select 1 from public.statement_lines
                      where line_key in ('2026-09-08|500000|1274000|0', '2026-09-10|5000|1275000|0')),
    'una línea sin decidir quedó guardada';

  -- Las gemelas: misma fecha, monto y saldo. La repetición las separa.
  select transaction_id into v_gemela0 from public.statement_lines where line_key = '2026-09-09|-4000|1270000|0';
  select transaction_id into v_gemela1 from public.statement_lines where line_key = '2026-09-09|-4000|1270000|1';
  assert v_gemela0 is not null and v_gemela1 is not null and v_gemela0 <> v_gemela1,
    'las dos líneas gemelas tenían que crear un gasto cada una';

  -- La compra quedó por su neto, y la devolución apunta a ella sin crear nada.
  select transaction_id into v_compra from public.statement_lines where line_key = '2026-09-02|-10000|840000|0';
  assert (select amount from public.transactions where id = v_compra) = 20.00, 'la compra no quedó por su neto';
  select transaction_id into v_neta from public.statement_lines
   where line_key = '2026-09-05|8000|844000|0' and decision = 'netted' and not created_by_import;
  assert v_neta = v_compra, 'la devolución no quedó enlazada a su compra';

  -- Lo que ya estaba se enlaza, no se crea ni se toca.
  assert exists (select 1 from public.statement_lines
                  where line_key = '2026-09-03|-4000|836000|0' and decision = 'linked'
                    and transaction_id = '30000000-0000-0000-0000-000000000001' and not created_by_import),
    'el metro anotado por el chat no quedó enlazado';
  assert (select (amount, source, card_id is null)::text from public.transactions
           where id = '30000000-0000-0000-0000-000000000001') = '(40.00,whatsapp,t)',
    'el movimiento enlazado se modificó';

  -- El pago de tarjeta no es un gasto: va a card_payments, desde la cuenta del banco.
  assert exists (select 1 from public.card_payments p join public.statement_lines s on s.card_payment_id = p.id
                  where p.card_id = '10000000-0000-0000-0000-000000000002' and p.amount = 500.00
                    and p.source_card_id = '10000000-0000-0000-0000-000000000001' and s.created_by_import),
    'el pago de la tarjeta no quedó registrado';

  -- El retiro se recuerda como omitido, sin movimiento.
  assert exists (select 1 from public.statement_lines
                  where line_key = '2026-09-07|-20000|774000|0' and decision = 'skipped' and transaction_id is null),
    'el retiro omitido no quedó recordado';

  -- Lo creado: de la cuenta del banco, con la fecha de la compra y la insignia.
  assert (select count(*) from public.transactions
           where source = 'statement' and card_id = '10000000-0000-0000-0000-000000000001'
             and payment_method = 'Ahorro prueba') = 5, 'los movimientos creados no llevan la cuenta del banco';
  assert exists (select 1 from public.transactions where source = 'statement' and description = 'Super ejemplo'
                    and date = '2026-08-31' and amount = 1500.00 and type = 'expense'),
    'la compra del súper no quedó con la fecha de la transacción';
  assert exists (select 1 from public.transactions where source = 'statement' and type = 'income'
                    and category = 'Otros ingreso personal' and amount = 40.00), 'la transferencia que entró no quedó como ingreso';
  assert (select match_key from public.statement_lines where line_key = '2026-09-01|-150000|850000|0') = 'super ejemplo',
    'no se guardó con qué aprender';
end $$;
\echo '✓ primera importación: 5 creados, 2 enlazados, 1 pago, 1 omitido, las 2 sin decidir afuera'
\echo '✓ las gemelas -40 / +40 / -40 del mismo día quedan como |0 y |1'
\echo '✓ la compra con su devolución en el mismo estado se guarda por su neto'

-- ─── El mismo PDF otra vez ──────────────────────────────────────────────────

create temp table antes as select pg_temp.conteo() as c;
create temp table imp2 as select public.importar_estado_de_cuenta(pg_temp.cab(), pg_temp.lin()) as r;

do $$
declare r jsonb := (select r from imp2);
begin
  assert r - 'import_id' = '{"creados":0,"enlazados":0,"pagos":0,"omitidos":0,"ya_estaban":9}',
    format('el reintento dio %s', r);
  assert pg_temp.conteo() = (select c from antes), format('el reintento escribió algo: %s', pg_temp.conteo());
  assert not exists (select 1 from public.statement_lines where import_id = (r->>'import_id')::uuid),
    'el reintento se adueñó de alguna línea';
end $$;
\echo '✓ un reintento idéntico no escribe nada en ninguna tabla'

-- ─── Lo borrado vuelve como pregunta; lo omitido se puede decidir de nuevo ──

delete from public.transactions where source = 'statement' and description = 'Super ejemplo';

do $$ begin
  assert exists (select 1 from public.statement_lines
                  where line_key = '2026-09-01|-150000|850000|0' and transaction_id is null),
    'borrar el gasto no dejó abierta su línea';
end $$;

create temp table imp3 as select public.importar_estado_de_cuenta(pg_temp.cab(),
  pg_temp.con(5, '{"decision":"expense","category":"Otros personal","description":"Retiro de efectivo"}')) as r;

do $$
declare r jsonb := (select r from imp3);
begin
  -- Solo el súper (borrado) y el retiro (omitido) vuelven a decidirse; las
  -- otras 7 siguen cerradas aunque el lote las vuelva a mandar.
  assert r - 'import_id' = '{"creados":2,"enlazados":0,"pagos":0,"omitidos":0,"ya_estaban":7}',
    format('la importación después de borrar dio %s', r);
  assert (select count(*) from public.transactions where description = 'Super ejemplo') = 1,
    'el súper tenía que volver una sola vez';
  assert (select count(*) from public.transactions where description = 'Retiro de efectivo') = 1,
    'el retiro tenía que anotarse una sola vez';
  assert (select count(*) from public.statement_lines) = 9, 'las líneas reabiertas se duplicaron';
  assert (select count(*) from public.statement_lines where import_id = (r->>'import_id')::uuid) = 2,
    'las líneas reabiertas no pasaron a la importación nueva';
end $$;
\echo '✓ borrar un gasto importado reabre solo esa línea'
\echo '✓ una línea omitida se puede decidir de nuevo'

-- ─── Deshacer ────────────────────────────────────────────────────────────────

create temp table des as select public.deshacer_importacion((select (r->>'import_id')::uuid from imp1)) as r;

do $$ begin
  -- Las 7 que siguen siendo de la primera; las 2 que decidió la tercera, no.
  assert (select r from des) = '{"deshechas":7}', format('deshacer dio %s', (select r from des));
  assert pg_temp.conteo() = '{"lineas":2,"importados":2,"pagos":0}',
    format('deshacer dejó otra cosa: %s', pg_temp.conteo());
  assert (select count(*) from public.statement_lines
           where import_id = (select (r->>'import_id')::uuid from imp3)) = 2,
    'deshacer la primera pisó lo que decidió la tercera';
  assert (select (amount, source)::text from public.transactions
           where id = '30000000-0000-0000-0000-000000000001') = '(40.00,whatsapp)',
    'deshacer tocó el movimiento que solo estaba enlazado';
end $$;
\echo '✓ deshacer borra lo que creó la importación y no toca lo enlazado ni lo que decidió otra'

-- ─── Otra persona ────────────────────────────────────────────────────────────

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false); end $$;

do $$ begin
  assert (select count(*) from public.statement_lines) = 0, 'Beto ve líneas de Ana';
  perform pg_temp.espera_error(pg_temp.cab(), pg_temp.lin(), 'CUENTA_INVALIDA');
  assert (select deshacer_importacion((select (r->>'import_id')::uuid from imp3))) = '{"deshechas":0}',
    'Beto pudo deshacer una importación de Ana';
end $$;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false); end $$;

do $$ begin
  assert pg_temp.conteo() = '{"lineas":2,"importados":2,"pagos":0}', 'lo de Ana cambió por algo que hizo Beto';
end $$;
\echo '✓ otra persona no ve las líneas, no puede usar la cuenta ni deshacer lo ajeno'

-- ─── Dos importaciones a la vez ─────────────────────────────────────────────
-- Dos teléfonos, o un doble toque: la segunda tiene que esperar a la primera y
-- encontrar todo ya importado, sin un error de clave duplicada y sin
-- duplicados. Hacen falta dos sesiones de verdad, y eso es dblink.

do $$ begin
  perform public.deshacer_importacion(import_id) from (select distinct import_id from public.statement_lines) x;
  assert pg_temp.conteo() = '{"lineas":0,"importados":0,"pagos":0}', 'no se pudo arrancar de cero';
end $$;

reset role;
create extension if not exists dblink;

do $$
declare
  v_con text := format('host=%s port=%s dbname=%s user=%s',
    split_part(current_setting('unix_socket_directories'), ',', 1), current_setting('port'),
    current_database(), session_user);
  v_sql text := format('select public.importar_estado_de_cuenta(%L::jsonb, %L::jsonb)::text',
    pg_temp.cab()::text, pg_temp.lin()::text);
  v_como text := $q$select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false)$q$;
  r1 jsonb; r2 jsonb;
begin
  perform dblink_connect('uno', v_con);
  perform dblink_connect('dos', v_con);
  perform dblink_exec('uno', 'set role authenticated');
  perform dblink_exec('dos', 'set role authenticated');
  perform x from dblink('uno', v_como) as t(x text);
  perform x from dblink('dos', v_como) as t(x text);

  -- La primera importa y se queda con la transacción abierta…
  perform dblink_exec('uno', 'begin');
  select x::jsonb into r1 from dblink('uno', v_sql) as t(x text);
  -- …y la segunda arranca mientras tanto: tiene que quedarse esperando.
  perform dblink_send_query('dos', v_sql);
  perform pg_sleep(0.5);
  assert dblink_is_busy('dos') = 1, 'la segunda importación no esperó a la primera';
  perform dblink_exec('uno', 'commit');
  select x::jsonb into r2 from dblink_get_result('dos') as t(x text);
  perform dblink_disconnect('uno');
  perform dblink_disconnect('dos');

  assert r1 - 'import_id' = '{"creados":5,"enlazados":2,"pagos":1,"omitidos":1,"ya_estaban":0}',
    format('la primera: %s', r1);
  assert r2 - 'import_id' = '{"creados":0,"enlazados":0,"pagos":0,"omitidos":0,"ya_estaban":9}',
    format('la segunda: %s', r2);
  assert (select count(*) from public.statement_lines
           where user_id = '00000000-0000-0000-0000-00000000000a') = 9, 'quedaron líneas de más';
  assert (select count(*) from public.transactions
           where user_id = '00000000-0000-0000-0000-00000000000a' and source = 'statement') = 5,
    'quedaron movimientos duplicados';
  assert (select count(*) from public.card_payments
           where user_id = '00000000-0000-0000-0000-00000000000a') = 1, 'quedó el pago duplicado';
end $$;
\echo '✓ dos importaciones a la vez: la segunda espera y encuentra las 9 ya importadas'
