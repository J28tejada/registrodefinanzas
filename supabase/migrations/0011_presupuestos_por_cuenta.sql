-- El presupuesto pasa a ser de la cuenta, no del usuario.
-- Correlo después de 0010_deudas.sql.
--
-- El problema: `budgets` solo tenía `user_id`, así que un tope creado para el
-- hogar aparecía también en la cuenta personal, y la barra lo comparaba contra
-- los gastos de todas las cuentas juntas. Un tope de RD$15.000 para el súper
-- del hogar se llenaba con el café que uno se toma solo.
--
-- Y en una cuenta compartida el tope tiene que ser uno solo: el gasto del hogar
-- lo hacen los dos, así que contar nada más los propios te deja creyendo que
-- vas por la mitad cuando ya se pasó.
--
-- `ledger_id` nulo sigue significando lo de antes: un tope personal sobre todas
-- tus cuentas. Los que ya existían quedan así, sin tocarse, para que cada quien
-- los reasigne desde la pantalla.

alter table public.budgets
  add column if not exists ledger_id uuid references public.ledgers (id) on delete cascade;

-- `unique (user_id, category)` impedía dos topes de "Alimentación" en cuentas
-- distintas, que es justamente lo que hay que poder hacer ahora.
alter table public.budgets drop constraint if exists budgets_user_id_category_key;

-- Uno por cuenta y categoría, sin importar quién lo creó: en una cuenta
-- compartida el tope es del hogar, y dos filas serían dos topes peleando.
create unique index if not exists budgets_ledger_category_idx
  on public.budgets (ledger_id, category)
  where ledger_id is not null;

-- Y uno por persona y categoría entre los globales.
create unique index if not exists budgets_user_category_idx
  on public.budgets (user_id, category)
  where ledger_id is null;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- El tope de una cuenta compartida lo ven y lo editan todos sus miembros.

drop policy if exists "propias" on public.budgets;
create policy "propias" on public.budgets for all to authenticated
  using (
    user_id = (select auth.uid())
    or ledger_id in (select c.ledger_id from public.cuentas_visibles((select auth.uid())) c)
  )
  with check (
    user_id = (select auth.uid())
    or ledger_id in (select c.ledger_id from public.cuentas_visibles((select auth.uid())) c)
  );

-- ─── Gasto del período ───────────────────────────────────────────────────────

/**
 * Lo gastado por cuenta y categoría, separando lo propio de lo de todos.
 *
 * Hacen falta las dos cifras porque conviven dos clases de tope: el de una
 * cuenta compartida se mide contra lo que gastaron todos sus miembros, y el
 * global —sin cuenta— contra lo que gastó uno solo, en todas sus cuentas.
 * Devolverlas juntas evita una segunda vuelta a la base.
 *
 * Sigue siendo SECURITY INVOKER: si alguien pasa otro p_user, RLS lo frena.
 */
drop function if exists public.spent_by_category(uuid, date, date);

create or replace function public.spent_by_category(
  p_user uuid, p_start date, p_end date
)
returns table (ledger_id uuid, category text, spent_all numeric, spent_mine numeric)
language sql stable as $$
  select t.ledger_id,
         t.category,
         sum(t.amount)::numeric,
         coalesce(sum(t.amount) filter (where t.user_id = p_user), 0)::numeric
    from public.transactions t
   where (
           t.user_id = p_user
           or t.ledger_id in (select c.ledger_id from public.cuentas_visibles(p_user) c)
         )
     and t.type = 'expense'
     and t.date >= p_start
     and t.date <= p_end
   group by t.ledger_id, t.category
$$;

notify pgrst, 'reload schema';
