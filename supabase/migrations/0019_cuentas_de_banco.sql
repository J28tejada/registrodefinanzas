-- La sección de tarjetas admite también cuentas de banco.
-- Correlo después de 0018_categorias_por_cuenta.sql.
--
-- `cards` ya guardaba efectivo y transferencia además de crédito y débito: era
-- una lista de medios de pago con nombre de tarjetas. Faltaba lo más usado
-- después de la tarjeta —la cuenta corriente y la de ahorro—, que hoy había que
-- anotar como "Otro" y quedaba sin distinguir.
--
-- La tabla no cambia de forma: solo se amplían los tipos que acepta. `last4`
-- sigue sirviendo (los últimos dígitos de la cuenta) y `issuer` es el banco.

alter table public.cards drop constraint if exists cards_kind_check;
alter table public.cards
  add constraint cards_kind_check
  check (kind in ('credit', 'debit', 'checking', 'savings', 'cash', 'transfer', 'other'));

comment on column public.cards.kind is
  'credit/debit = tarjetas. checking/savings = cuentas de banco. cash/transfer/other = el resto.';

notify pgrst, 'reload schema';
