-- Estados de cuenta del banco: qué línea ya pasó por la app y qué se hizo con ella.
-- Correlo después de 0023_alimentacion_por_comida.sql.
--
-- Una tabla y no una columna en `transactions`, por tres motivos:
--  * las líneas que NO crean un movimiento (un retiro que no se anota, un pago
--    de tarjeta, una que ya estaba anotada) también tienen que recordarse, o la
--    próxima vez se ofrecen de nuevo;
--  * las dos pantallas de edición reescriben `source`, y un miembro de una
--    cuenta compartida puede editar cualquier movimiento: una marca ahí no dura;
--  * anotar un gasto, lo más usado de la app, no cambia en nada.
--
-- Es aditiva: el código de hoy no la ve. El de la importación, sin ella, se
-- niega a importar en vez de importar sin la clave: una línea guardada sin
-- clave no se reconoce nunca más y se duplicaría en la próxima subida.

create table if not exists public.statement_lines (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  -- Una importación = una llamada a importar_estado_de_cuenta. Es lo que deshace "Deshacer".
  import_id         uuid not null,
  bank              text not null check (bank ~ '^[a-z_]{2,20}$'),
  account_last4     text not null check (account_last4 ~ '^[0-9]{4}$'),
  -- fecha de entrada | centavos con signo | saldo después | repetición. La arma
  -- la función, no el cliente: el saldo después de cada línea es lo único que
  -- separa dos retiros iguales del mismo día, y no depende de la tarjeta elegida.
  line_key          text not null check (line_key ~ '^\d{4}-\d{2}-\d{2}\|-?\d+\|-?\d+\|\d+$'),
  date              date not null,
  kind              text not null check (kind in ('purchase','fee','withdrawal','deposit','interest',
                      'refund','transfer_out','transfer_in','own_transfer','other')),
  decision          text not null check (decision in ('expense','income','linked','card_payment',
                      'netted','skipped')),
  -- Comercio normalizado o contraparte por sus últimos 4 ('shell', 'a:1234'): de acá se aprende.
  match_key         text not null default '' check (length(match_key) <= 60),
  -- `set null` y no `cascade`: si alguien borra lo importado, la línea queda
  -- ABIERTA y vuelve como pregunta, no como gasto nuevo que se cuela solo.
  transaction_id    uuid references public.transactions (id) on delete set null,
  card_payment_id   uuid references public.card_payments (id) on delete set null,
  created_by_import boolean not null default false,
  created_at        timestamptz not null default now(),
  -- Común y no parcial: un índice parcial no se puede usar como blanco de ON CONFLICT desde PostgREST.
  constraint statement_lines_una_vez unique (user_id, bank, account_last4, line_key)
);
create index if not exists statement_lines_fecha_idx  on public.statement_lines (user_id, date);
create index if not exists statement_lines_match_idx  on public.statement_lines (user_id, match_key, created_at desc);
create index if not exists statement_lines_import_idx on public.statement_lines (import_id);
-- Sin estos, borrar un movimiento recorre la tabla entera para poner el null.
create index if not exists statement_lines_tx_idx on public.statement_lines (transaction_id);
create index if not exists statement_lines_cp_idx on public.statement_lines (card_payment_id);

alter table public.statement_lines enable row level security;
drop policy if exists "propias" on public.statement_lines;
create policy "propias" on public.statement_lines for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

/**
 * Importa un estado de cuenta entero en una sola transacción.
 *
 * SECURITY INVOKER: corre como el usuario y RLS aplica igual que en el resto.
 * El teléfono la llama directo, así que todo lo que importa se comprueba acá y
 * no en el cliente: la cadena de saldos completa, el signo contra la decisión,
 * que la categoría exista con ese tipo en esa cuenta, de quién es cada tarjeta,
 * y que un movimiento ya anotado no explique dos líneas.
 *
 * Los montos salen de los centavos, nunca de un decimal que mande el cliente.
 */
create or replace function public.importar_estado_de_cuenta(p_cab jsonb, p_lineas jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_bank   text := p_cab->>'bank';
  v_l4     text := p_cab->>'last4';
  v_ledger uuid := nullif(p_cab->>'ledger_id', '')::uuid;
  v_import uuid := gen_random_uuid();
  v_total  int  := coalesce(jsonb_array_length(p_lineas), 0);
  v_cuenta public.cards%rowtype;
  v_previa public.statement_lines%rowtype;
  v_scope text;
  v_claves text[] := '{}'; v_vistos jsonb := '{}'::jsonb;
  l jsonb; i int; j int; v_cnt int; v_sum bigint;
  v_triple text; v_n int; v_key text; v_dec text; v_saldo bigint; v_cents bigint;
  v_monto numeric(14,2);
  v_linea uuid; v_tx uuid; v_cp uuid; v_card uuid; v_medio text; v_cat uuid; v_creado boolean;
  v_abierta boolean;
  n_creados int := 0; n_enlazados int := 0; n_pagos int := 0; n_omitidos int := 0; n_ya int := 0;
begin
  if v_uid is null then raise exception 'NO_AUTENTICADO'; end if;
  if v_total = 0 or v_total > 1000 or v_total <> (p_cab->>'line_count')::int then
    raise exception 'NO_CUADRA';
  end if;

  -- 1) El lote es el estado de cuenta ENTERO y cuadra al centavo: frena un
  --    cliente viejo o un lote recortado. De paso se arman las claves.
  v_saldo := (p_cab->>'opening_cents')::bigint;
  for i in 0 .. v_total - 1 loop
    l := p_lineas->i;
    v_cents := (l->>'cents')::bigint;
    v_saldo := v_saldo + v_cents;
    if v_cents = 0 or v_saldo <> (l->>'balance')::bigint then raise exception 'NO_CUADRA'; end if;
    if (l->>'date')::date > (l->>'posted')::date or (l->>'date')::date < (l->>'posted')::date - 31 then
      raise exception 'FECHA_INVALIDA';
    end if;
    v_dec := l->>'decision';
    if v_dec is null or v_dec not in ('pending','expense','income','linked','card_payment','netted','skipped') then
      raise exception 'DECISION_INVALIDA';
    end if;
    if (v_cents < 0 and v_dec in ('income','netted'))
       or (v_cents > 0 and v_dec in ('expense','card_payment')) then
      raise exception 'SIGNO_INVALIDO';
    end if;
    v_triple := (l->>'posted') || '|' || v_cents || '|' || v_saldo;
    v_n := coalesce((v_vistos->>v_triple)::int, 0);
    v_vistos := v_vistos || jsonb_build_object(v_triple, v_n + 1);
    v_claves := v_claves || (v_triple || '|' || v_n);
  end loop;
  if v_saldo <> (p_cab->>'closing_cents')::bigint then raise exception 'NO_CUADRA'; end if;

  -- 2) Una compra guardada por su neto tiene que tener su devolución en este
  --    lote, y la resta tiene que dar exacta. Sin esto, un error del cliente
  --    podría achicar un gasto en silencio.
  for i in 0 .. v_total - 1 loop
    l := p_lineas->i;
    if l ? 'net_cents' then
      select count(*), coalesce(sum((e.value->>'cents')::bigint), 0) into v_cnt, v_sum
        from jsonb_array_elements(p_lineas) e
       where e.value->>'decision' = 'netted' and e.value->>'nets_key' = v_claves[i + 1];
      if l->>'decision' <> 'expense' or v_cnt <> 1 or (l->>'net_cents')::bigint <= 0
         or abs((l->>'cents')::bigint) - v_sum <> (l->>'net_cents')::bigint then
        raise exception 'NETO_INVALIDO';
      end if;
    end if;
    if l->>'decision' = 'netted' then
      -- Una devolución solo se descuenta de su compra en este mismo estado. Restarle
      -- a un gasto que ya estaba anotado tocaría movimientos existentes (y en una
      -- cuenta compartida, de otra persona): eso no lo hace una importación.
      j := array_position(v_claves, l->>'nets_key');
      if j is null or not ((p_lineas->(j - 1)) ? 'net_cents') then raise exception 'NETO_INVALIDO'; end if;
    end if;
  end loop;

  -- 3) La cuenta del banco es mía y es esa; la cuenta de la app es una donde soy miembro.
  select * into v_cuenta from public.cards
   where id = nullif(p_cab->>'account_card_id', '')::uuid and user_id = v_uid
     and kind in ('savings', 'checking') and last4 = v_l4;
  if not found then raise exception 'CUENTA_INVALIDA'; end if;
  select type into v_scope from public.ledgers where id = v_ledger and public.es_miembro(id);
  if v_scope is null then raise exception 'LIBRO_INVALIDO'; end if;

  -- 4) Línea por línea. Las devoluciones al final, porque apuntan a su compra.
  for i in select g from generate_series(0, v_total - 1) g
            order by ((p_lineas->g)->>'decision' = 'netted'), g loop
    l := p_lineas->i;
    v_dec := l->>'decision';
    continue when v_dec = 'pending';
    v_key := v_claves[i + 1];
    v_cents := (l->>'cents')::bigint;
    v_monto := abs(v_cents) / 100.0;
    v_tx := null; v_cp := null; v_creado := false;

    -- Reclamar la línea. Si ya estaba: cerrada, no se toca (reintento, dos
    -- teléfonos a la vez, el mismo PDF dos veces); abierta, se vuelve a decidir.
    insert into public.statement_lines (user_id, import_id, bank, account_last4, line_key, date, kind, decision, match_key)
    values (v_uid, v_import, v_bank, v_l4, v_key, (l->>'date')::date, l->>'kind', v_dec,
            coalesce(left(l->>'match_key', 60), ''))
    on conflict (user_id, bank, account_last4, line_key) do nothing
    returning id into v_linea;
    if v_linea is null then
      select * into v_previa from public.statement_lines
       where user_id = v_uid and bank = v_bank and account_last4 = v_l4 and line_key = v_key for update;
      if not found then raise exception 'REINTENTAR'; end if;
      v_abierta := v_previa.decision = 'skipped'
        or (v_previa.decision in ('expense','income','linked','netted')
            and v_previa.transaction_id is null and v_previa.card_payment_id is null)
        or (v_previa.decision = 'card_payment' and v_previa.card_payment_id is null);
      if not v_abierta or (v_previa.decision = 'skipped' and v_dec = 'skipped') then
        n_ya := n_ya + 1;
        continue;
      end if;
      delete from public.statement_lines where id = v_previa.id;
      insert into public.statement_lines (user_id, import_id, bank, account_last4, line_key, date, kind, decision, match_key)
      values (v_uid, v_import, v_bank, v_l4, v_key, (l->>'date')::date, l->>'kind', v_dec,
              coalesce(left(l->>'match_key', 60), ''))
      returning id into v_linea;
    end if;

    case v_dec
    when 'expense', 'income' then
      select id into v_cat from public.categories
       where ledger_id = v_ledger and parent_id is null and name = l->>'category'
         and type = case v_dec when 'expense' then 'expense' else 'income' end;
      if v_cat is null or (nullif(l->>'subcategory', '') is not null and not exists (
           select 1 from public.categories where parent_id = v_cat and name = l->>'subcategory')) then
        raise exception 'CATEGORIA_INVALIDA';
      end if;
      if l ? 'net_cents' then v_monto := (l->>'net_cents')::bigint / 100.0; end if;
      v_card := coalesce(nullif(l->>'card_id', '')::uuid, v_cuenta.id);
      select name into v_medio from public.cards where id = v_card and user_id = v_uid;
      if v_medio is null then raise exception 'CUENTA_INVALIDA'; end if;
      insert into public.transactions (user_id, ledger_id, type, scope, amount, category, subcategory,
             description, date, source, payment_method, card_id)
      values (v_uid, v_ledger, case v_dec when 'expense' then 'expense' else 'income' end, v_scope, v_monto,
             l->>'category', nullif(l->>'subcategory', ''),
             coalesce(nullif(left(btrim(l->>'description'), 120), ''), 'Movimiento del banco'),
             (l->>'date')::date, 'statement', v_medio, v_card)
      returning id into v_tx;
      v_creado := true; n_creados := n_creados + 1;

    when 'card_payment' then         -- las mismas reglas que registrarPagoTarjeta (lib/db.ts)
      select id into v_cp from public.cards
       where id = nullif(l->>'credit_card_id', '')::uuid and user_id = v_uid and kind = 'credit';
      if v_cp is null or v_cp = v_cuenta.id then raise exception 'TARJETA_INVALIDA'; end if;
      insert into public.card_payments (card_id, user_id, amount, date, source_card_id, notes)
      values (v_cp, v_uid, v_monto, (l->>'date')::date, v_cuenta.id, 'Del estado de cuenta')
      returning id into v_cp;
      v_creado := true; n_pagos := n_pagos + 1;

    when 'linked' then
      if l ? 'card_payment_id' then
        select id into v_cp from public.card_payments
         where id = nullif(l->>'card_payment_id', '')::uuid and user_id = v_uid;
        if v_cp is null or v_cents > 0 then raise exception 'MOVIMIENTO_INVALIDO'; end if;
        if exists (select 1 from public.statement_lines s where s.card_payment_id = v_cp and s.id <> v_linea) then
          raise exception 'YA_ENLAZADO';
        end if;
      else
        -- RLS decide qué se ve: lo propio y lo de las cuentas compartidas.
        select id into v_tx from public.transactions
         where id = nullif(l->>'transaction_id', '')::uuid
           and type = case when v_cents < 0 then 'expense' else 'income' end;
        if v_tx is null then raise exception 'MOVIMIENTO_INVALIDO'; end if;
        -- Un movimiento explica UNA línea: si no, un gasto anotado una vez
        -- taparía varias compras reales del banco.
        if exists (select 1 from public.statement_lines s
                    where s.transaction_id = v_tx and s.id <> v_linea) then
          raise exception 'YA_ENLAZADO';
        end if;
      end if;
      n_enlazados := n_enlazados + 1;

    when 'netted' then
      -- La compra de este mismo estado, que ya se guardó por su neto.
      select s.transaction_id into v_tx from public.statement_lines s
       where s.user_id = v_uid and s.import_id = v_import and s.bank = v_bank and s.account_last4 = v_l4
         and s.line_key = l->>'nets_key' and s.created_by_import and s.decision = 'expense';
      if v_tx is null then raise exception 'NETO_INVALIDO'; end if;
      n_enlazados := n_enlazados + 1;

    when 'skipped' then
      n_omitidos := n_omitidos + 1;
    end case;

    update public.statement_lines
       set transaction_id = v_tx, card_payment_id = v_cp, created_by_import = v_creado
     where id = v_linea;
  end loop;

  return jsonb_build_object('import_id', v_import, 'creados', n_creados, 'enlazados', n_enlazados,
         'pagos', n_pagos, 'omitidos', n_omitidos, 'ya_estaban', n_ya);
end $$;

/**
 * Deshace una importación: borra lo que creó y olvida sus líneas, que vuelven a
 * quedar sin decidir. Lo que solo se ENLAZÓ con un movimiento que ya existía no
 * se toca: ese movimiento lo anotó la persona, no la importación.
 *
 * Una línea que una importación posterior volvió a decidir ya tiene otro
 * `import_id`, así que deshacer una vieja no la pisa.
 */
create or replace function public.deshacer_importacion(p_import uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_uid uuid := auth.uid(); s record; n int := 0;
begin
  if v_uid is null then raise exception 'NO_AUTENTICADO'; end if;
  for s in select * from public.statement_lines where user_id = v_uid and import_id = p_import for update loop
    if s.created_by_import then
      if s.card_payment_id is not null then
        delete from public.card_payments where id = s.card_payment_id and user_id = v_uid;
      end if;
      if s.transaction_id is not null then
        delete from public.transactions where id = s.transaction_id and user_id = v_uid;
      end if;
    end if;
    n := n + 1;
  end loop;
  delete from public.statement_lines where user_id = v_uid and import_id = p_import;
  return jsonb_build_object('deshechas', n);
end $$;

revoke execute on function public.importar_estado_de_cuenta(jsonb, jsonb) from public, anon;
revoke execute on function public.deshacer_importacion(uuid) from public, anon;
grant execute on function public.importar_estado_de_cuenta(jsonb, jsonb) to authenticated;
grant execute on function public.deshacer_importacion(uuid) to authenticated;

notify pgrst, 'reload schema';
