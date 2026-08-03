-- Aceptar una invitación fallaba con 42702: column reference "ledger_id" is
-- ambiguous. Correlo después de 0006_nombre_preferido.sql.
--
-- `returns table (ledger_id uuid, ...)` declara un `ledger_id` en el ámbito de
-- la función, así que el `on conflict (ledger_id, user_id)` no sabía si eso era
-- la variable o la columna de la tabla. Se reemplaza por un NOT EXISTS, que no
-- tiene esa duda y hace lo mismo: no volver a insertar a quien ya es miembro.

create or replace function public.aceptar_invitacion(p_code text)
returns table (ledger_id uuid, ledger_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_ledger uuid;
  v_name   text;
  v_exp    timestamptz;
  v_uid    uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  select i.ledger_id, l.name, i.expires_at into v_ledger, v_name, v_exp
    from public.ledger_invites i
    join public.ledgers l on l.id = i.ledger_id
   where upper(i.code) = upper(trim(p_code));

  if v_ledger is null then
    raise exception 'CODIGO_INVALIDO';
  end if;
  if v_exp <= now() then
    raise exception 'CODIGO_EXPIRADO';
  end if;

  insert into public.ledger_members (ledger_id, user_id, role)
  select v_ledger, v_uid, 'member'
   where not exists (
     select 1 from public.ledger_members m
      where m.ledger_id = v_ledger and m.user_id = v_uid
   );

  return query select v_ledger, v_name;
end $$;

notify pgrst, 'reload schema';
