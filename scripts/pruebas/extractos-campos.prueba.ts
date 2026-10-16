/**
 * Lo que entra a la importación de un estado de cuenta.
 *
 * `leerPedidoDeImportacion` es lo último que ve el teléfono antes de llamar a
 * la función SQL sin ruta en el medio. La función vuelve a comprobar todo,
 * pero acá se frena antes y diciendo qué línea está mal; y acá se limpia lo
 * que una decisión no usa, para que no llegue a la base.
 *
 * Datos inventados: una cuenta de ahorro que termina en 3456 y montos de
 * juguete. Es el mismo lote que `scripts/pg/estado-de-cuenta.prueba.sql`.
 */
import { crear } from './aserciones';
import {
  esFechaIso, leerConsultaDeContexto, leerPedidoDeImportacion, MAX_LINEAS_POR_PEDIDO,
} from '@/lib/extractos-campos';
import { ERRORES_DE_IMPORTACION } from '@/lib/extractos/textos';

const t = crear('extractos-campos');

const CUENTA = '10000000-0000-4000-8000-000000000001';
const VISA = '10000000-0000-4000-8000-000000000002';
const LIBRO = '20000000-0000-4000-8000-000000000001';
const METRO = '30000000-0000-4000-8000-000000000001';
const PAGO = '40000000-0000-4000-8000-000000000001';

const MAL_ARMADO = 'El pedido de importación vino mal armado. No se anotó nada.';

type Linea = Record<string, unknown>;

/** El lote entero, nuevo cada vez: los casos lo modifican. */
function pedido(): { cab: Record<string, unknown>; lineas: Linea[] } & Record<string, unknown> {
  return {
    cab: {
      bank: 'popular', last4: '3456', account_card_id: CUENTA, ledger_id: LIBRO,
      opening_cents: 1000000, closing_cents: 1275000, line_count: 11,
    },
    lineas: [
      { posted: '2026-09-01', date: '2026-08-31', cents: -150000, balance: 850000, kind: 'purchase', decision: 'expense', category: 'Alimentación', description: 'Super ejemplo', match_key: 'super ejemplo' },
      { posted: '2026-09-02', date: '2026-09-02', cents: -10000, balance: 840000, kind: 'purchase', decision: 'expense', net_cents: 2000, category: 'Otros personal', description: 'Tienda ejemplo (con devolución)', match_key: 'tienda ejemplo' },
      { posted: '2026-09-03', date: '2026-09-03', cents: -4000, balance: 836000, kind: 'purchase', decision: 'linked', transaction_id: METRO, match_key: 'metro' },
      { posted: '2026-09-05', date: '2026-09-05', cents: 8000, balance: 844000, kind: 'refund', decision: 'netted', nets_key: '2026-09-02|-10000|840000|0', match_key: 'tienda ejemplo' },
      { posted: '2026-09-05', date: '2026-09-05', cents: -50000, balance: 794000, kind: 'transfer_out', decision: 'card_payment', credit_card_id: VISA, match_key: 'a:1111' },
      { posted: '2026-09-07', date: '2026-09-07', cents: -20000, balance: 774000, kind: 'withdrawal', decision: 'skipped', match_key: '' },
      { posted: '2026-09-08', date: '2026-09-08', cents: 500000, balance: 1274000, kind: 'deposit', decision: 'pending', match_key: 'dep:acte' },
      { posted: '2026-09-09', date: '2026-09-09', cents: -4000, balance: 1270000, kind: 'purchase', decision: 'expense', category: 'Transporte', subcategory: 'Transporte público', description: 'Metro', match_key: 'metro' },
      { posted: '2026-09-09', date: '2026-09-09', cents: 4000, balance: 1274000, kind: 'transfer_in', decision: 'income', category: 'Otros ingreso personal', description: 'Transferencia de ··9876', match_key: 'de:9876' },
      { posted: '2026-09-09', date: '2026-09-09', cents: -4000, balance: 1270000, kind: 'purchase', decision: 'expense', category: 'Transporte', subcategory: 'Transporte público', description: 'Metro', match_key: 'metro' },
      { posted: '2026-09-10', date: '2026-09-10', cents: 5000, balance: 1275000, kind: 'refund', decision: 'pending', match_key: 'otra tienda' },
    ],
  };
}

/** El lote con la línea `i` cambiada. Un `undefined` en los cambios borra el campo. */
function con(i: number, cambios: Linea, base = pedido()) {
  const linea = { ...base.lineas[i], ...cambios };
  for (const [k, v] of Object.entries(cambios)) if (v === undefined) delete linea[k];
  base.lineas[i] = linea;
  return base;
}

function error(b: Record<string, unknown>): string {
  const r = leerPedidoDeImportacion(b);
  return r.ok ? '(pasó)' : r.error;
}

// ── El lote bueno ────────────────────────────────────────────────────────────

const bueno = leerPedidoDeImportacion(pedido());
t.cierto('el lote completo entra', bueno.ok);
if (bueno.ok) {
  t.igual('van todas las líneas, también las sin decidir', bueno.pedido.lineas.length, 11);
  t.igual('una sin decidir viaja solo con lo básico', bueno.pedido.lineas[6], {
    posted: '2026-09-08', date: '2026-09-08', cents: 500000, balance: 1274000,
    kind: 'deposit', decision: 'pending', match_key: 'dep:acte',
  });
  t.igual('la subcategoría que no viene queda en null', bueno.pedido.lineas[0].subcategory, null);
  t.igual('la compra con devolución lleva su neto', bueno.pedido.lineas[1].net_cents, 2000);
  t.igual('la cabecera no cambia', bueno.pedido.cab.account_card_id, CUENTA);
  t.cierto('sin cuenta nueva ni categorías', !('cuentaNueva' in bueno.pedido) && !('categoriasNuevas' in bueno.pedido));
}

// Lo que una decisión no usa no llega a la base, aunque el cliente lo mande:
// el `card_id` de una tarjeta de débito, un `subtract_from` de otra versión.
const conDeMas = leerPedidoDeImportacion(con(0, {
  card_id: VISA, subtract_from: METRO, transaction_id: METRO, grouped: true, debt_id: METRO,
}));
t.igual('se limpia lo que la decisión no usa', conDeMas.ok && Object.keys(conDeMas.pedido.lineas[0]).sort(), [
  'balance', 'category', 'cents', 'date', 'decision', 'description', 'kind', 'match_key', 'posted', 'subcategory',
]);
const omitida = leerPedidoDeImportacion(con(5, { category: 'Otros personal', description: 'x' }));
t.igual('una omitida no lleva categoría', omitida.ok && Object.keys(omitida.pedido.lineas[5]).sort(), [
  'balance', 'cents', 'date', 'decision', 'kind', 'match_key', 'posted',
]);

const recortada = leerPedidoDeImportacion(con(0, { category: '  Alimentación ', description: '  Super  ' }));
t.cierto('los textos se recortan',
  recortada.ok && recortada.pedido.lineas[0].category === 'Alimentación'
  && recortada.pedido.lineas[0].description === 'Super');
const sinMatch = leerPedidoDeImportacion(con(0, { match_key: undefined }));
t.cierto('sin clave de comercio va vacía', sinMatch.ok && sinMatch.pedido.lineas[0].match_key === '');

// ── La forma ─────────────────────────────────────────────────────────────────

t.igual('sin cabecera', error({ lineas: [] }), MAL_ARMADO);
t.igual('sin líneas', error({ cab: pedido().cab }), MAL_ARMADO);
t.igual('las líneas no son una lista', error({ cab: pedido().cab, lineas: {} }), MAL_ARMADO);
t.igual('lote vacío', error({ ...pedido(), lineas: [] }),
  'El estado de cuenta no tiene movimientos para importar.');

const enorme = pedido();
enorme.lineas = Array.from({ length: MAX_LINEAS_POR_PEDIDO + 1 }, () => pedido().lineas[0]);
enorme.cab.line_count = enorme.lineas.length;
t.igual('más de mil líneas', error(enorme),
  'Son demasiados movimientos para un estado de cuenta (el tope es 1000).');

const recortado = pedido();
recortado.lineas.pop();
t.igual('un lote recortado no cuadra', error(recortado), ERRORES_DE_IMPORTACION.NO_CUADRA);

// ── La cabecera ──────────────────────────────────────────────────────────────

const cab = (cambios: Record<string, unknown>) => {
  const p = pedido();
  p.cab = { ...p.cab, ...cambios };
  return p;
};
t.igual('banco con mayúsculas', error(cab({ bank: 'Popular' })), MAL_ARMADO);
t.igual('últimos 4 de tres', error(cab({ last4: '345' })),
  'Los últimos 4 de la cuenta tienen que ser cuatro números.');
t.igual('sin cuenta donde anotar', error(cab({ ledger_id: 'personal' })), 'Elegí en qué cuenta anotar.');
t.igual('sin cuenta del banco', error(cab({ account_card_id: null })),
  'Elegí de qué cuenta de la Billetera es el estado de cuenta.');
t.igual('saldo inicial con decimales', error(cab({ opening_cents: 10000.5 })), MAL_ARMADO);
t.igual('saldo inicial en texto', error(cab({ opening_cents: '1000000' })), MAL_ARMADO);
t.igual('un centavo de diferencia al cierre', error(cab({ closing_cents: 1275001 })), ERRORES_DE_IMPORTACION.NO_CUADRA);
t.igual('un centavo de diferencia al abrir', error(cab({ opening_cents: 1000001 })), ERRORES_DE_IMPORTACION.NO_CUADRA);

// ── Cada línea ───────────────────────────────────────────────────────────────

t.igual('un balance corrido un centavo', error(con(0, { balance: 850001 })), ERRORES_DE_IMPORTACION.NO_CUADRA);
t.igual('el 30 de febrero', error(con(0, { date: '2026-02-30' })), 'La línea 1 tiene una fecha inválida.');
t.igual('una fecha sin ceros', error(con(2, { posted: '2026-9-3' })), 'La línea 3 tiene una fecha inválida.');
t.igual('la compra después de asentada', error(con(0, { date: '2026-09-02' })), ERRORES_DE_IMPORTACION.FECHA_INVALIDA);
t.cierto('asentada 31 días después todavía vale', leerPedidoDeImportacion(con(0, { date: '2026-08-01' })).ok);
t.igual('asentada 32 días después ya no', error(con(0, { date: '2026-07-31' })), ERRORES_DE_IMPORTACION.FECHA_INVALIDA);

for (const cents of [-1500.5, '-150000', 0, null, Number.MAX_SAFE_INTEGER + 2]) {
  t.igual(`monto inválido: ${String(cents)}`, error(con(0, { cents })), 'La línea 1 tiene un monto inválido.');
}
t.igual('balance en texto', error(con(0, { balance: '850000' })), 'La línea 1 tiene un monto inválido.');
t.igual('tipo de línea inventado', error(con(0, { kind: 'debt' })),
  'La línea 1 tiene un tipo de movimiento desconocido.');
t.igual('clave de comercio de más de 60', error(con(0, { match_key: 'x'.repeat(61) })), MAL_ARMADO);

// ── La decisión contra el signo ──────────────────────────────────────────────

// Fuera de esta versión: las cuotas de deuda y restarle a un gasto ya anotado.
for (const decision of ['debt_payment', 'restar', 'subtract_from', '', undefined]) {
  t.igual(`decisión que no existe: ${String(decision)}`, error(con(5, { decision })),
    ERRORES_DE_IMPORTACION.DECISION_INVALIDA);
}
t.igual('un débito como ingreso', error(con(0, { decision: 'income' })), ERRORES_DE_IMPORTACION.SIGNO_INVALIDO);
t.igual('un débito como devolución', error(con(0, { decision: 'netted' })), ERRORES_DE_IMPORTACION.SIGNO_INVALIDO);
t.igual('un crédito como gasto', error(con(6, { decision: 'expense', category: 'Otros personal' })),
  ERRORES_DE_IMPORTACION.SIGNO_INVALIDO);
t.igual('un crédito como pago de tarjeta', error(con(6, { decision: 'card_payment', credit_card_id: VISA })),
  ERRORES_DE_IMPORTACION.SIGNO_INVALIDO);
for (const decision of ['skipped', 'pending']) {
  t.cierto(`${decision} vale para un débito`, leerPedidoDeImportacion(con(0, { decision })).ok);
  t.cierto(`${decision} vale para un crédito`, leerPedidoDeImportacion(con(8, { decision })).ok);
}

// ── Lo que pide cada decisión ────────────────────────────────────────────────

t.igual('gasto sin categoría', error(con(0, { category: undefined })), 'La línea 1 no tiene categoría.');
t.igual('gasto con la categoría en blanco', error(con(0, { category: '   ' })), 'La línea 1 no tiene categoría.');
t.igual('categoría de más de 40', error(con(0, { category: 'x'.repeat(41) })), 'La categoría de la línea 1 es inválida.');
t.igual('ingreso sin categoría', error(con(8, { category: undefined })), 'La línea 9 no tiene categoría.');
t.igual('subcategoría que no es texto', error(con(7, { subcategory: 3 })),
  'La línea 8 tiene una subcategoría inválida.');
t.igual('descripción de más de 120', error(con(0, { description: 'x'.repeat(121) })),
  'La descripción de la línea 1 es demasiado larga.');

t.igual('pago de tarjeta sin tarjeta', error(con(4, { credit_card_id: undefined })),
  'La línea 5 no dice qué tarjeta se pagó.');
t.igual('pago de tarjeta con un id roto', error(con(4, { credit_card_id: 'visa' })),
  'La línea 5 no dice qué tarjeta se pagó.');
t.igual('la cuenta del banco pagándose a sí misma', error(con(4, { credit_card_id: CUENTA })),
  ERRORES_DE_IMPORTACION.TARJETA_INVALIDA);

t.igual('enlazada sin nada', error(con(2, { transaction_id: undefined })),
  'La línea 3 no dice con qué movimiento se enlaza.');
t.igual('enlazada con las dos cosas', error(con(2, { card_payment_id: PAGO })),
  'La línea 3 no dice con qué movimiento se enlaza.');
t.igual('enlazada con un id roto', error(con(2, { transaction_id: 'metro' })), MAL_ARMADO);
const conPago = leerPedidoDeImportacion(con(4, { decision: 'linked', credit_card_id: undefined, card_payment_id: PAGO }));
t.cierto('un débito enlazado con un pago de tarjeta ya registrado',
  conPago.ok && conPago.pedido.lineas[4].card_payment_id === PAGO && !('credit_card_id' in conPago.pedido.lineas[4]));
t.igual('un crédito enlazado con un pago de tarjeta', error(con(8, { decision: 'linked', card_payment_id: PAGO })),
  ERRORES_DE_IMPORTACION.SIGNO_INVALIDO);
t.igual('dos líneas contra el mismo movimiento', error(con(0, { decision: 'linked', transaction_id: METRO })),
  ERRORES_DE_IMPORTACION.YA_ENLAZADO);
t.igual('dos líneas contra el mismo pago',
  error(con(4, { decision: 'linked', card_payment_id: PAGO }, con(0, { decision: 'linked', card_payment_id: PAGO }))),
  ERRORES_DE_IMPORTACION.YA_ENLAZADO);

// ── Una compra y su devolución en el mismo estado ────────────────────────────

t.igual('la compra por su neto sin su devolución', error(con(3, { decision: 'pending' })),
  ERRORES_DE_IMPORTACION.NETO_INVALIDO);
t.igual('un neto que no da la resta', error(con(1, { net_cents: 2001 })), ERRORES_DE_IMPORTACION.NETO_INVALIDO);
t.igual('un neto de cero: se devolvió todo', error(con(1, { net_cents: 0 })), ERRORES_DE_IMPORTACION.NETO_INVALIDO);
t.igual('un neto igual a la compra', error(con(1, { net_cents: 10000 })), ERRORES_DE_IMPORTACION.NETO_INVALIDO);
t.igual('un neto con decimales', error(con(1, { net_cents: 2000.5 })), ERRORES_DE_IMPORTACION.NETO_INVALIDO);
t.igual('un neto en un ingreso', error(con(8, { net_cents: 1000 })), ERRORES_DE_IMPORTACION.NETO_INVALIDO);
t.igual('una devolución sin a qué compra', error(con(3, { nets_key: undefined })), ERRORES_DE_IMPORTACION.NETO_INVALIDO);
t.igual('una clave mal escrita', error(con(3, { nets_key: '2026-09-02|-10000' })), ERRORES_DE_IMPORTACION.NETO_INVALIDO);
t.igual('restarle a un gasto ya anotado no se hace',
  error(con(3, { nets_key: undefined, subtract_from: METRO })), ERRORES_DE_IMPORTACION.NETO_INVALIDO);
t.igual('una devolución contra una compra que no va por su neto',
  error(con(3, { nets_key: '2026-09-01|-150000|850000|0' })), ERRORES_DE_IMPORTACION.NETO_INVALIDO);
t.igual('una devolución contra una línea que no existe',
  error(con(3, { nets_key: '2026-09-02|-10000|840000|1' })), ERRORES_DE_IMPORTACION.NETO_INVALIDO);
// Dos devoluciones contra la misma compra: la otra sin decidir (+50) pasa a
// apuntar a la tienda. Aunque los montos se acomodaran, un neto es UNA resta.
t.igual('dos devoluciones contra la misma compra',
  error(con(10, { decision: 'netted', nets_key: '2026-09-02|-10000|840000|0' })), ERRORES_DE_IMPORTACION.NETO_INVALIDO);

// ── La cuenta del banco nueva ────────────────────────────────────────────────

const nueva = { name: 'Ahorro Popular', kind: 'savings', last4: '3456', issuer: 'Banco Popular', color: 'teal' };
const conNueva = (cambios: Record<string, unknown> = {}, cabecera: Record<string, unknown> = { account_card_id: null }) => {
  const p = cab(cabecera);
  p.cuentaNueva = { ...nueva, ...cambios };
  return p;
};
const creada = leerPedidoDeImportacion(conNueva());
t.igual('la cuenta nueva entra', creada.ok && creada.pedido.cuentaNueva,
  { name: 'Ahorro Popular', kind: 'savings', last4: '3456', issuer: 'Banco Popular', color: 'teal' });
t.cierto('y la cabecera espera su id', creada.ok && creada.pedido.cab.account_card_id === null);
t.cierto('sin la clave de la cuenta también vale', leerPedidoDeImportacion(conNueva({}, { account_card_id: undefined })).ok);
t.igual('cuenta nueva Y una existente', error(conNueva({}, {})), MAL_ARMADO);
t.igual('cuenta nueva sin nombre', error(conNueva({ name: ' ' })), 'Ponele un nombre a la cuenta del banco.');
t.igual('cuenta nueva de crédito', error(conNueva({ kind: 'credit' })),
  'La cuenta del banco tiene que ser de ahorro o corriente.');
t.igual('cuenta nueva con otros 4', error(conNueva({ last4: '9999' })), ERRORES_DE_IMPORTACION.CUENTA_INVALIDA);
t.igual('cuenta nueva con un color inventado', error(conNueva({ color: 'violeta' })), 'Color inválido');
t.igual('el color por defecto', (() => {
  const r = leerPedidoDeImportacion(conNueva({ color: undefined }));
  return r.ok ? r.pedido.cuentaNueva?.color : null;
})(), 'blue');
// Las reglas del cupo son las del alta de siempre (`tarjetas-campos`).
t.igual('cuenta nueva con un cupo negativo', error(conNueva({ credit_limit: -1 })),
  'El límite tiene que ser mayor que cero.');
const sinCuentaNueva = pedido();
sinCuentaNueva.cuentaNueva = null;
t.cierto('una cuenta nueva en null es "no vino"', leerPedidoDeImportacion(sinCuentaNueva).ok);

// ── Completar los 4 y crear categorías ───────────────────────────────────────

const completar = (c: unknown) => ({ ...pedido(), completarLast4: c });
const completada = leerPedidoDeImportacion(completar({ card_id: CUENTA, last4: '3456' }));
t.igual('completar los 4 de la cuenta usada', completada.ok && completada.pedido.completarLast4,
  { card_id: CUENTA, last4: '3456' });
t.igual('completar otra cuenta', error(completar({ card_id: VISA, last4: '3456' })), ERRORES_DE_IMPORTACION.CUENTA_INVALIDA);
t.igual('completar con otros 4', error(completar({ card_id: CUENTA, last4: '1111' })), ERRORES_DE_IMPORTACION.CUENTA_INVALIDA);
t.igual('completar y crear a la vez', error({ ...conNueva(), completarLast4: { card_id: CUENTA, last4: '3456' } }),
  MAL_ARMADO);

const categorias = (c: unknown) => ({ ...pedido(), categoriasNuevas: c });
const conCategorias = leerPedidoDeImportacion(categorias([{ ledger_id: LIBRO, name: ' Cargos bancarios ', type: 'expense' }]));
t.igual('una categoría nueva', conCategorias.ok && conCategorias.pedido.categoriasNuevas,
  [{ ledger_id: LIBRO, name: 'Cargos bancarios', type: 'expense' }]);
const ningunaNueva = leerPedidoDeImportacion(categorias([]));
t.cierto('una lista vacía no se manda', ningunaNueva.ok && !('categoriasNuevas' in ningunaNueva.pedido));
t.igual('una categoría en otra cuenta',
  error(categorias([{ ledger_id: '20000000-0000-4000-8000-000000000002', name: 'Cargos', type: 'expense' }])), MAL_ARMADO);
t.igual('una categoría sin nombre', error(categorias([{ ledger_id: LIBRO, name: '', type: 'expense' }])),
  'Hay una categoría nueva sin nombre.');
t.igual('una categoría de un tipo inventado', error(categorias([{ ledger_id: LIBRO, name: 'Cargos', type: 'gasto' }])),
  MAL_ARMADO);
t.igual('demasiadas categorías nuevas',
  error(categorias(Array.from({ length: 21 }, (_, i) => ({ ledger_id: LIBRO, name: `C${i}`, type: 'expense' })))),
  MAL_ARMADO);

// ── La consulta del contexto ─────────────────────────────────────────────────

const consulta = { banco: 'popular', ultimos4: '3456', desde: '2026-09-01', hasta: '2026-09-30' };
t.igual('una consulta buena', leerConsultaDeContexto(consulta), { ok: true, consulta });
t.cierto('sin banco', !leerConsultaDeContexto({ ...consulta, banco: null }).ok);
t.cierto('los 4 con letras', !leerConsultaDeContexto({ ...consulta, ultimos4: '34a6' }).ok);
t.cierto('el mes 13', !leerConsultaDeContexto({ ...consulta, desde: '2026-13-01' }).ok);
t.cierto('las fechas al revés', !leerConsultaDeContexto({ ...consulta, desde: '2026-10-01' }).ok);
t.cierto('un mismo día vale', leerConsultaDeContexto({ ...consulta, hasta: '2026-09-01' }).ok);

t.cierto('29 de febrero bisiesto', esFechaIso('2028-02-29'));
t.cierto('29 de febrero no bisiesto', !esFechaIso('2026-02-29'));
t.cierto('una fecha con hora no', !esFechaIso('2026-09-01T00:00:00Z'));

t.resumen();
