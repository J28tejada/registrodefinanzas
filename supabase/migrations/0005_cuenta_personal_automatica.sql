-- Cada usuario nuevo arranca con una cuenta personal ya creada.
-- Correlo después de 0004_login_google.sql.
--
-- Antes, quien se registraba caía en una app donde no podía anotar nada hasta
-- crear una cuenta a mano. Eso es fricción sin motivo: tener finanzas propias
-- es el caso base, no una configuración. Crear más cuentas o renombrar esta
-- sigue siendo decisión del usuario.

create or replace function public.crear_cuenta_personal()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ledger uuid;
begin
  -- Si ya tiene alguna, no se toca: este trigger no debe pisar nada.
  if exists (select 1 from public.ledgers where user_id = new.id) then
    return new;
  end if;

  insert into public.ledgers (user_id, name, color, type, description)
  values (new.id, 'Personal', 'green', 'personal', '')
  returning id into v_ledger;

  insert into public.ledger_members (ledger_id, user_id, role)
  values (v_ledger, new.id, 'owner')
  on conflict (ledger_id, user_id) do nothing;

  return new;
end $$;

-- Solo en INSERT: en UPDATE ya existe la cuenta y volver a mirar sería al pepe.
drop trigger if exists crear_cuenta_personal_trigger on auth.users;
create trigger crear_cuenta_personal_trigger
  after insert on auth.users
  for each row execute function public.crear_cuenta_personal();

-- ─── Los que ya estaban ──────────────────────────────────────────────────────

-- Quien se registró antes de esta migración y quedó sin ninguna cuenta
insert into public.ledgers (user_id, name, color, type, description)
select u.id, 'Personal', 'green', 'personal', ''
  from auth.users u
 where not exists (select 1 from public.ledgers l where l.user_id = u.id);

-- Y su membresía como dueño, incluso para cuentas viejas que no la tuvieran
insert into public.ledger_members (ledger_id, user_id, role)
select l.id, l.user_id, 'owner' from public.ledgers l
on conflict (ledger_id, user_id) do nothing;

-- Los movimientos que quedaron sin cuenta cuando el formulario todavía lo
-- permitía: existen en la base pero no aparecen en ninguna vista ni suman a
-- ningún saldo. Se adoptan en la cuenta personal para que vuelvan a verse.
update public.transactions t
   set ledger_id = (
     select l.id from public.ledgers l
      where l.user_id = t.user_id
      order by l.created_at asc
      limit 1
   )
 where t.ledger_id is null;

notify pgrst, 'reload schema';
