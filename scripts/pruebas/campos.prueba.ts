/**
 * Las validaciones que corren de los dos lados.
 *
 * Estas funciones se mudaron de `app/api/` a `lib/` justamente para que el
 * teléfono corriera las mismas reglas que la web. Eso las volvió el único lugar
 * donde se decide qué puede entrar a la base — y a un lugar así conviene
 * apretarlo, porque ya no hay una segunda copia que sirva de red.
 */
import { crear } from './aserciones';
import { leerCamposDeCiclo } from '@/lib/tarjetas-campos';
import { leerDeudaNueva } from '@/lib/deudas-campos';
import { leerIconoYColor } from '@/lib/categorias-campos';
import { leerArticuloNuevo, leerCambiosDeArticulo } from '@/lib/compras-campos';

const t = crear('campos');

// ── El ciclo de una tarjeta ──────────────────────────────────────────────────

t.igual('sin claves no cambia nada', leerCamposDeCiclo({}), { ok: true, campos: {} });

t.igual(
  'vaciar el límite se puede deshacer: null es "sin configurar"',
  leerCamposDeCiclo({ credit_limit: null }),
  { ok: true, campos: { credit_limit: null } },
);
t.igual(
  'el string vacío también, que es lo que manda un campo borrado',
  leerCamposDeCiclo({ credit_limit: '' }),
  { ok: true, campos: { credit_limit: null } },
);
t.cierto('un límite de cero no es un límite', !leerCamposDeCiclo({ credit_limit: 0 }).ok);
t.cierto('ni uno negativo', !leerCamposDeCiclo({ credit_limit: -100 }).ok);

for (const dia of [0, 32, 1.5, -3, NaN]) {
  t.cierto(`día de corte inválido: ${dia}`, !leerCamposDeCiclo({ statement_day: dia }).ok);
}
for (const dia of [1, 15, 31]) {
  t.igual(`día de corte válido: ${dia}`, leerCamposDeCiclo({ statement_day: dia }),
    { ok: true, campos: { statement_day: dia } });
}
t.cierto('día de pago fuera de rango', !leerCamposDeCiclo({ due_day: 45 }).ok);

t.igual('el saldo inicial vacío es cero', leerCamposDeCiclo({ opening_balance: '' }),
  { ok: true, campos: { opening_balance: 0 } });
t.cierto('el saldo inicial no puede ser negativo',
  !leerCamposDeCiclo({ opening_balance: -1 }).ok);

t.cierto('fecha inicial mal escrita', !leerCamposDeCiclo({ opening_date: '10/09/2026' }).ok);
t.igual('fecha inicial bien escrita', leerCamposDeCiclo({ opening_date: '2026-09-10' }),
  { ok: true, campos: { opening_date: '2026-09-10' } });

// ── El alta de una deuda ─────────────────────────────────────────────────────

const deuda = {
  name: 'Préstamo del carro', creditor: 'Banco Popular',
  total_amount: 240000, installment_amount: 5000, installments: 48,
  start_date: '2026-10-01', category: 'Transporte', ledger_id: 'c1',
};

t.cierto('una deuda completa entra', leerDeudaNueva(deuda).ok);
t.cierto('sin nombre no', !leerDeudaNueva({ ...deuda, name: '   ' }).ok);
t.cierto('con total cero no', !leerDeudaNueva({ ...deuda, total_amount: 0 }).ok);
t.cierto('con cuota cero no', !leerDeudaNueva({ ...deuda, installment_amount: 0 }).ok);
// Media cuota haría que el avance del mes se calcule contra un número que no
// existe; cero, que se divida por cero.
t.cierto('con cuotas fraccionarias no', !leerDeudaNueva({ ...deuda, installments: 4.5 }).ok);
t.cierto('con cero cuotas no', !leerDeudaNueva({ ...deuda, installments: 0 }).ok);
t.cierto('sin categoría no', !leerDeudaNueva({ ...deuda, category: '' }).ok);
t.cierto('con fecha mal escrita no', !leerDeudaNueva({ ...deuda, start_date: '1/10/26' }).ok);

const leida = leerDeudaNueva({ ...deuda, name: '  Préstamo  ', creditor: '  Banco  ' });
t.cierto('el nombre y el acreedor se recortan',
  leida.ok && leida.datos.name === 'Préstamo' && leida.datos.creditor === 'Banco');
const sinCuenta = leerDeudaNueva({ ...deuda, ledger_id: '' });
t.cierto('la cuenta vacía queda en null', sinCuenta.ok && sinCuenta.datos.ledger_id === null);

// ── El dibujo de una categoría ───────────────────────────────────────────────

t.igual('un ícono del catálogo entra', leerIconoYColor({ icon: 'utensilios' }),
  { ok: true, campos: { icon: 'utensilios' } });
t.cierto('uno inventado no', !leerIconoYColor({ icon: 'dragon' }).ok);
t.igual('null es "sacale el ícono"', leerIconoYColor({ icon: null }),
  { ok: true, campos: { icon: null } });
t.igual('no mandar la clave es "no lo toques"', leerIconoYColor({}), { ok: true, campos: {} });
t.cierto('un color que no está en la paleta no entra', !leerIconoYColor({ color: 'fucsia' }).ok);
t.igual('uno que sí', leerIconoYColor({ color: 'blue' }), { ok: true, campos: { color: 'blue' } });

// ── Un artículo del súper ────────────────────────────────────────────────────

t.igual(
  'con solo el nombre alcanza: cantidad 1 y precio 0',
  leerArticuloNuevo({ name: 'Leche' }),
  { ok: true, datos: { name: 'Leche', category: 'Otros', quantity: 1, unit: 'unidad', unit_price: 0 } },
);
t.cierto('sin nombre no', !leerArticuloNuevo({ name: '  ' }).ok);
t.cierto('con cantidad cero no', !leerArticuloNuevo({ name: 'Leche', quantity: 0 }).ok);
t.cierto('con precio negativo no', !leerArticuloNuevo({ name: 'Leche', unit_price: -5 }).ok);
t.igual(
  'el string vacío vuelve a los valores por defecto',
  leerArticuloNuevo({ name: 'Pan', quantity: '', unit_price: '', category: '  ', unit: '' }),
  { ok: true, datos: { name: 'Pan', category: 'Otros', quantity: 1, unit: 'unidad', unit_price: 0 } },
);

t.cierto('editar sin mandar nada no es un cambio', !leerCambiosDeArticulo({}).ok);
t.igual('solo lo que viene', leerCambiosDeArticulo({ quantity: 3 }),
  { ok: true, datos: { quantity: 3 } });
t.cierto('el nombre no se puede vaciar', !leerCambiosDeArticulo({ name: '   ' }).ok);

// El tilde es lo único que separa un artículo de compra de uno de lista: una
// plantilla no se mete en el carrito.
t.cierto('sin conTilde, `checked` no entra —y solo, no es un cambio—',
  !leerCambiosDeArticulo({ checked: true }).ok);
t.igual('con conTilde sí', leerCambiosDeArticulo({ checked: true }, { conTilde: true }),
  { ok: true, datos: { checked: true } });

t.resumen();
