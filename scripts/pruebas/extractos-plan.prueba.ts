/**
 * El plan de una importación: cotejar, categorías, la cuenta, lo que se
 * sugiere por defecto, los cambios, la vista y el pedido.
 *
 * Todo con datos INVENTADOS: el repo es público y un estado de cuenta real
 * tiene nombres, números de cuenta y en qué gasta una persona. La titular es
 * "ANA PRUEBA GOMEZ", la cuenta termina en 3456 y los comercios son genéricos.
 */
import { crear } from './aserciones';
import type { Card, Category } from '@/lib/types';
import type {
  Aprendido, ClaseDeLinea, ContextoDeExtracto, ExtractoLeido, LineaDeExtracto, LineaPrevia,
  MovimientoCandidato, PagoCandidato, PedidoDeImportacion,
} from '@/lib/extractos/tipos';
import { cotejar, Cotejo, mencionaComercio, tokenDeComercio } from '@/lib/extractos/cotejar';
import { categoriaPara } from '@/lib/extractos/categorizar';
import { elegirCuenta, nombreDeProducto } from '@/lib/extractos/cuenta';
import {
  Plan, aplicarCambio, armarPedido, candidatosParaEnlazar, hojaDeLinea, libroSugerido,
  planearImportacion, vistaDelPlan,
} from '@/lib/extractos/planear';
import * as T from '@/lib/extractos/textos-plan';

const t = crear('extractos-plan');

// ─── Datos inventados ────────────────────────────────────────────────────────

const HOY = '2026-10-16';
const SALDO_INICIAL = 5000000;

interface Mov {
  asentada: string;
  fecha?: string;
  centavos: number;
  clase: ClaseDeLinea;
  comercio?: string;
  descripcion?: string;
  matchKey?: string;
  contraparte?: string | null;
  /** El índice de la compra, para una devolución. */
  devolucionDe?: number;
}

/** Arma un estado que cuadra: saldos encadenados y claves con la misma fórmula que la base. */
function extractoDe(movs: Mov[], extra: Partial<ExtractoLeido> = {}): ExtractoLeido {
  let saldo = SALDO_INICIAL;
  const vistos = new Map<string, number>();
  const lineas: LineaDeExtracto[] = movs.map(m => {
    saldo += m.centavos;
    const triple = `${m.asentada}|${m.centavos}|${saldo}`;
    const n = vistos.get(triple) ?? 0;
    vistos.set(triple, n + 1);
    return {
      clave: `${triple}|${n}`,
      asentada: m.asentada,
      fecha: m.fecha ?? m.asentada,
      centavos: m.centavos,
      saldoCentavos: saldo,
      clase: m.clase,
      comercio: m.comercio ?? '',
      descripcion: m.descripcion ?? m.comercio ?? 'Movimiento',
      matchKey: m.matchKey ?? '',
      ultimos4Contraparte: m.contraparte ?? null,
      devolucionDe: null,
    };
  });
  movs.forEach((m, i) => {
    if (m.devolucionDe !== undefined) lineas[i].devolucionDe = lineas[m.devolucionDe].clave;
  });
  return {
    formato: 'popular-cuenta',
    banco: 'popular',
    producto: 'CUENTA DIGITAL LIBRE',
    tipoDeCuenta: 'savings',
    moneda: 'DOP',
    ultimos4: '3456',
    desde: lineas[0]?.asentada ?? '2026-09-01',
    hasta: lineas[lineas.length - 1]?.asentada ?? '2026-09-30',
    saldoInicialCentavos: SALDO_INICIAL,
    saldoFinalCentavos: saldo,
    conciliacion: {
      lineas: lineas.length,
      creditos: lineas.filter(l => l.centavos > 0).length,
      debitos: lineas.filter(l => l.centavos < 0).length,
    },
    lineas,
    ...extra,
  };
}

function compra(asentada: string, centavos: number, comercio: string, extra: Partial<Mov> = {}): Mov {
  return {
    asentada, centavos: -Math.abs(centavos), clase: 'purchase', comercio,
    matchKey: comercio.toLowerCase().replace(/[^a-z ]/g, ''), ...extra,
  };
}

function card(id: string, extra: Partial<Card> = {}): Card {
  return {
    id, name: id, kind: 'savings', last4: '', issuer: '', color: 'blue', archived: false,
    credit_limit: null, statement_day: null, due_day: null, opening_balance: 0, opening_date: null,
    alerts: false, created_at: '2026-01-01T00:00:00Z', ...extra,
  };
}

const CUENTA = card('card-cuenta', { name: 'Ahorros Popular', last4: '3456', issuer: 'Banco Popular' });
const VISA = card('card-visa', { name: 'Visa Oro', kind: 'credit', last4: '1111', issuer: 'Banco Popular' });
const OTRA = card('card-otra', { name: 'Ahorro Otro Banco', last4: '7777', issuer: 'Otro Banco' });
const TARJETAS = [CUENTA, VISA, OTRA];

let siguiente = 0;
function cat(ledger: string, name: string, type: 'income' | 'expense', padre?: string): Category {
  siguiente++;
  return {
    id: padre ? `${ledger}:${padre}:${name}` : `${ledger}:${name}`,
    ledger_id: ledger, name, type, origen: 'app',
    parent_id: padre ? `${ledger}:${padre}` : null,
    icon: null, color: null, created_at: `2026-01-01T00:00:${String(siguiente % 60).padStart(2, '0')}Z`,
  };
}

const PERSONAL: Category[] = [
  cat('personal', 'Alimentación', 'expense'),
  cat('personal', 'Desayuno', 'expense', 'Alimentación'),
  cat('personal', 'Almuerzo', 'expense', 'Alimentación'),
  cat('personal', 'Transporte', 'expense'),
  cat('personal', 'Combustible', 'expense', 'Transporte'),
  cat('personal', 'Peaje', 'expense', 'Transporte'),
  cat('personal', 'Taxi / Uber', 'expense', 'Transporte'),
  cat('personal', 'Servicios básicos', 'expense'),
  cat('personal', 'Teléfono', 'expense', 'Servicios básicos'),
  cat('personal', 'Suscripciones', 'expense'),
  cat('personal', 'Software', 'expense', 'Suscripciones'),
  cat('personal', 'Entretenimiento', 'expense'),
  cat('personal', 'Streaming', 'expense', 'Entretenimiento'),
  cat('personal', 'Salud', 'expense'),
  cat('personal', 'Farmacia', 'expense', 'Salud'),
  cat('personal', 'Hogar', 'expense'),
  cat('personal', 'Otros personal', 'expense'),
  cat('personal', 'Salario', 'income'),
  cat('personal', 'Inversiones', 'income'),
  cat('personal', 'Intereses', 'income', 'Inversiones'),
  cat('personal', 'Otros ingreso personal', 'income'),
];
const NEGOCIO: Category[] = [
  cat('negocio', 'Impuestos', 'expense'),
  cat('negocio', 'Materiales', 'expense'),
  cat('negocio', 'Otros negocio', 'expense'),
  cat('negocio', 'Ventas', 'income'),
  cat('negocio', 'Comisiones', 'income'),
  cat('negocio', 'Otros ingreso negocio', 'income'),
];
const TODAS = [...PERSONAL, ...NEGOCIO];

function mov(p: Partial<MovimientoCandidato> & { id: string; centavos: number; date: string }): MovimientoCandidato {
  return {
    type: 'expense', description: '', category: 'Otros personal', subcategory: null, source: 'whatsapp',
    ledger_id: 'personal', card_id: null, author_id: 'yo', author_name: 'Yo', esCompraDelSuper: false, ...p,
  };
}

function pago(p: Partial<PagoCandidato> & { id: string; centavos: number; date: string }): PagoCandidato {
  return { card_id: VISA.id, source_card_id: null, ...p };
}

function previa(line_key: string, p: Partial<LineaPrevia> = {}): LineaPrevia {
  return {
    line_key, bank: 'popular', account_last4: '3456', decision: 'expense', kind: 'purchase', match_key: '',
    transaction_id: null, card_payment_id: null, created_by_import: true, import_id: 'imp-1',
    date: '2026-09-01', created_at: '2026-10-02T15:00:00Z', ...p,
  };
}

function ctxDe(p: Partial<ContextoDeExtracto> = {}): ContextoDeExtracto {
  return {
    migracionLista: true, movimientos: [], pagosDeTarjeta: [], lineasPrevias: [], aprendido: [],
    cards: TARJETAS, moneda: 'DOP', yo: 'yo', ...p,
  };
}

const OP = { ledgerId: 'personal', ledgerName: 'Personal', categorias: TODAS, hoy: HOY };

/** Mezcla determinista (la misma semilla da el mismo orden): la prueba no puede depender del azar. */
function mezclar<X>(xs: X[], semilla: number): X[] {
  const a = xs.slice();
  let s = semilla;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function tipoDe(c: Cotejo | undefined): string {
  if (!c) return 'falta';
  if (c.tipo === 'exacto') return `exacto:${c.candidato.tipo === 'movimiento' ? c.candidato.movimiento.id : c.candidato.pago.id}`;
  if (c.tipo === 'posible') {
    return 'posible:' + c.candidatos
      .map(x => `${x.tipo === 'movimiento' ? x.movimiento.id : x.pago.id}/${x.motivo}`).join(',');
  }
  return 'ninguno';
}

function cotejos(e: ExtractoLeido, ctx: ContextoDeExtracto): string[] {
  const m = cotejar(e.lineas, ctx, { banco: 'popular', ultimos4: '3456', cuentaId: CUENTA.id });
  return e.lineas.map(l => tipoDe(m.get(l.clave)));
}

/**
 * Lo mismo que controla `importar_estado_de_cuenta` antes de tocar nada: la
 * cadena de saldos, el signo contra la decisión, las claves y los netos. Si el
 * pedido pasa esto, la base no lo rechaza por armado.
 */
function cuadraComoLaBase(p: PedidoDeImportacion): string | null {
  if (p.lineas.length !== p.cab.line_count) return 'NO_CUADRA (cantidad)';
  let saldo = p.cab.opening_cents;
  const vistos = new Map<string, number>();
  const claves: string[] = [];
  for (const l of p.lineas) {
    saldo += l.cents;
    if (l.cents === 0 || saldo !== l.balance) return 'NO_CUADRA';
    if ((l.cents < 0 && (l.decision === 'income' || l.decision === 'netted')) ||
        (l.cents > 0 && (l.decision === 'expense' || l.decision === 'card_payment'))) return 'SIGNO_INVALIDO';
    const triple = `${l.posted}|${l.cents}|${saldo}`;
    const n = vistos.get(triple) ?? 0;
    vistos.set(triple, n + 1);
    claves.push(`${triple}|${n}`);
  }
  if (saldo !== p.cab.closing_cents) return 'NO_CUADRA (cierre)';
  for (let i = 0; i < p.lineas.length; i++) {
    const l = p.lineas[i];
    if (l.net_cents !== undefined) {
      const netas = p.lineas.filter(x => x.decision === 'netted' && x.nets_key === claves[i]);
      const suma = netas.reduce((s, x) => s + x.cents, 0);
      if (l.decision !== 'expense' || netas.length !== 1 || l.net_cents <= 0 || -l.cents - suma !== l.net_cents) {
        return 'NETO_INVALIDO';
      }
    }
    if (l.decision === 'netted') {
      const j = claves.indexOf(l.nets_key ?? '');
      if (j < 0 || p.lineas[j].net_cents === undefined) return 'NETO_INVALIDO';
    }
    if ((l.decision === 'expense' || l.decision === 'income') && !l.category) return 'CATEGORIA_INVALIDA';
    if (l.decision === 'linked' && !l.transaction_id && !l.card_payment_id) return 'MOVIMIENTO_INVALIDO';
    if (l.decision === 'card_payment' && !l.credit_card_id) return 'TARJETA_INVALIDA';
  }
  const enlazados = p.lineas.map(l => l.transaction_id ?? l.card_payment_id).filter(Boolean);
  if (new Set(enlazados).size !== enlazados.length) return 'YA_ENLAZADO';
  return null;
}

// ─── cotejar ─────────────────────────────────────────────────────────────────

{
  // Siete viajes en metro iguales el mismo día y tres anotados: se enlazan
  // tres, uno a uno, y los otros cuatro son nuevos. Nunca uno explica dos.
  const e = extractoDe(Array.from({ length: 7 }, () => compra('2026-09-10', 4000, 'Metro')));
  const ctx = ctxDe({
    movimientos: ['tx-m1', 'tx-m2', 'tx-m3'].map(id =>
      mov({ id, centavos: 4000, date: '2026-09-10', description: 'Metro' })),
  });
  const r = cotejos(e, ctx);
  t.igual('7 iguales contra 3 anotados: 3 enlazados y 4 nuevos', r,
    ['exacto:tx-m1', 'exacto:tx-m2', 'exacto:tx-m3', 'ninguno', 'ninguno', 'ninguno', 'ninguno']);
}

{
  // La ventana: [fecha − 3, asentada + 3] para lo anotado a mano o por chat.
  const e = extractoDe([compra('2026-09-12', 12300, 'Ferreteria Sol', { fecha: '2026-09-10' })]);
  const caso = (date: string) => cotejos(e, ctxDe({ movimientos: [mov({ id: 'tx', centavos: 12300, date })] }))[0];
  t.igual('3 días antes de la compra entra', caso('2026-09-07'), 'exacto:tx');
  t.igual('4 días antes no', caso('2026-09-06'), 'ninguno');
  t.igual('3 días después de asentada entra', caso('2026-09-15'), 'exacto:tx');
  t.igual('4 días después no', caso('2026-09-16'), 'ninguno');
}

{
  // Lo del correo se fecha el día del escaneo: su ventana llega a asentada + 35.
  const e = extractoDe([compra('2026-09-12', 45600, 'Tienda Online', { fecha: '2026-09-10' })]);
  const caso = (date: string) =>
    cotejos(e, ctxDe({ movimientos: [mov({ id: 'tx-c', centavos: 45600, date, source: 'ai' })] }))[0];
  t.igual('una del correo 20 días después: exacta si es la única', caso('2026-09-30'), 'exacto:tx-c');
  t.igual('asentada + 35 todavía entra', caso('2026-10-17'), 'exacto:tx-c');
  t.igual('asentada + 36 ya no', caso('2026-10-18'), 'ninguno');
  t.igual('un día antes de la compra entra', caso('2026-09-09'), 'exacto:tx-c');
  t.igual('dos días antes no', caso('2026-09-08'), 'ninguno');
}

{
  // Lo que anotó otra persona de la cuenta compartida nunca se enlaza solo.
  const e = extractoDe([compra('2026-09-05', 40000, 'Farmacia Uno')]);
  const ctx = ctxDe({
    movimientos: [mov({ id: 'tx-ana', centavos: 40000, date: '2026-09-05', author_id: 'ana', author_name: 'Ana' })],
  });
  t.igual('monto exacto de la pareja: se pregunta', cotejos(e, ctx), ['posible:tx-ana/pareja']);
}

{
  // Del correo con dos líneas posibles: no se sabe cuál es, se pregunta en las dos.
  const e = extractoDe([
    compra('2026-09-05', 9900, 'Kiosco'),
    compra('2026-09-08', 9900, 'Kiosco'),
  ]);
  const ctx = ctxDe({ movimientos: [mov({ id: 'tx-c', centavos: 9900, date: '2026-09-20', source: 'ai' })] });
  t.igual('del correo sin pareja única: posible en las dos', cotejos(e, ctx),
    ['posible:tx-c/correo', 'posible:tx-c/correo']);

  const una = extractoDe([compra('2026-09-05', 9900, 'Kiosco')]);
  const dos = ctxDe({
    movimientos: [
      mov({ id: 'tx-c1', centavos: 9900, date: '2026-09-20', source: 'ai' }),
      mov({ id: 'tx-c2', centavos: 9900, date: '2026-09-21', source: 'ai' }),
    ],
  });
  t.igual('una línea con dos del correo: posible, con las dos', cotejos(una, dos),
    ['posible:tx-c1/correo,tx-c2/correo']);
}

{
  // El súper se guarda con el total ESTIMADO del carrito.
  const e = extractoDe([compra('2026-09-14', 250000, 'Super Nacional')]);
  const caso = (centavos: number, date: string) => cotejos(e, ctxDe({
    movimientos: [mov({ id: 'tx-s', centavos, date, description: 'Compra del súper', esCompraDelSuper: true })],
  }))[0];
  t.igual('súper un 4% arriba al día siguiente: se ofrece', caso(260000, '2026-09-15'), 'posible:tx-s/super');
  t.igual('súper un 10% exacto todavía', caso(275000, '2026-09-14'), 'posible:tx-s/super');
  t.igual('súper un 12% arriba ya no', caso(280000, '2026-09-14'), 'ninguno');
  t.igual('súper dos días después ya no', caso(260000, '2026-09-16'), 'ninguno');
  t.igual('con monto chico manda el piso de 20.00',
    cotejos(extractoDe([compra('2026-09-14', 5000, 'Super Nacional')]), ctxDe({
      movimientos: [mov({ id: 'tx-s', centavos: 6900, date: '2026-09-14', esCompraDelSuper: true })],
    }))[0], 'posible:tx-s/super');
}

{
  // Un cobro en dólares anotado con otro monto: el mismo comercio cerca en la fecha.
  const e = extractoDe([compra('2026-09-03', 119000, 'Spotify')]);
  const caso = (date: string, description: string) => cotejos(e, ctxDe({
    movimientos: [mov({ id: 'tx-sp', centavos: 2000, date, description })],
  }))[0];
  t.igual('mismo comercio, otro monto, al día siguiente: se ofrece', caso('2026-09-04', 'Spotify'), 'posible:tx-sp/comercio');
  t.igual('4 días después no', caso('2026-09-07', 'Spotify'), 'ninguno');
  t.igual('otro comercio no', caso('2026-09-04', 'Panadería'), 'ninguno');
  t.cierto('"Pedidos Ya" nombra a pedidosya', mencionaComercio('Pedidos Ya almuerzo', 'pedidosya'));
  t.cierto('"Uber Eats" nombra a uber', mencionaComercio('Uber Eats', 'uber'));
  t.cierto('"tubería" NO nombra a uber', !mencionaComercio('Arreglo de tubería', 'uber'));
  t.igual('el comercio sin palabras vacías', tokenDeComercio('super nacional'), 'nacional');
  t.igual('una transferencia no tiene comercio', tokenDeComercio('a:1234'), null);
}

{
  // Un pago de tarjeta que ya se había registrado.
  const e = extractoDe([{
    asentada: '2026-09-21', fecha: '2026-09-20', centavos: -1500000, clase: 'transfer_out',
    descripcion: 'Transferencia a tu tarjeta (··1111)', matchKey: 'a:1111', contraparte: '1111',
  }]);
  const caso = (p: Partial<PagoCandidato>) =>
    cotejos(e, ctxDe({ pagosDeTarjeta: [pago({ id: 'pago-1', centavos: 1500000, date: '2026-09-22', ...p })] }))[0];
  t.igual('pago exacto a la tarjeta: ya estaba', caso({}), 'exacto:pago-1');
  t.igual('desde esta misma cuenta también', caso({ source_card_id: CUENTA.id }), 'exacto:pago-1');
  t.igual('desde otra cuenta no', caso({ source_card_id: OTRA.id }), 'ninguno');
  t.igual('a otra tarjeta (··2222) no', cotejos(e, ctxDe({
    cards: [...TARJETAS, card('card-mc', { kind: 'credit', last4: '2222' })],
    pagosDeTarjeta: [pago({ id: 'pago-1', card_id: 'card-mc', centavos: 1500000, date: '2026-09-22' })],
  }))[0], 'ninguno');
  t.igual('6 días después de asentada no', caso({ date: '2026-09-27' }), 'ninguno');
}

{
  // Lo que ya explica otra línea, de esta cuenta o de otra, no se ofrece más.
  const e = extractoDe([compra('2026-09-05', 7700, 'Kiosco')]);
  const ctx = ctxDe({
    movimientos: [mov({ id: 'tx-usado', centavos: 7700, date: '2026-09-05' })],
    lineasPrevias: [previa('2026-09-05|-7700|1|0', { account_last4: '9999', transaction_id: 'tx-usado' })],
  });
  t.igual('un movimiento ya enlazado en otra importación se excluye', cotejos(e, ctx), ['ninguno']);

  // Una línea cerrada no se coteja: no le quita el candidato a nadie.
  const dos = extractoDe([compra('2026-09-05', 7700, 'Kiosco'), compra('2026-09-06', 7700, 'Kiosco')]);
  const cerrada = ctxDe({
    movimientos: [mov({ id: 'tx-libre', centavos: 7700, date: '2026-09-06' })],
    lineasPrevias: [previa(dos.lineas[0].clave, { transaction_id: 'tx-viejo' })],
  });
  t.igual('la línea cerrada no consume candidatos', cotejos(dos, cerrada), ['ninguno', 'exacto:tx-libre']);
}

{
  const e = extractoDe([
    { asentada: '2026-09-05', centavos: -500000, clase: 'withdrawal', descripcion: 'Retiro de efectivo', matchKey: 'retiro' },
    { asentada: '2026-09-06', centavos: -300000, clase: 'own_transfer', descripcion: 'Entre tus cuentas' },
    { asentada: '2026-09-07', centavos: 5000, clase: 'deposit', descripcion: 'Depósito', matchKey: 'dep:acte' },
  ]);
  const ctx = ctxDe({
    movimientos: [
      mov({ id: 'tx-r', centavos: 500000, date: '2026-09-05' }),
      mov({ id: 'tx-o', centavos: 300000, date: '2026-09-06' }),
      mov({ id: 'tx-g', centavos: 5000, date: '2026-09-07' }),
    ],
  });
  t.igual('los retiros y lo de entre cuentas no gastan candidatos; un crédito no es un gasto',
    cotejos(e, ctx), ['ninguno', 'ninguno', 'ninguno']);
}

{
  // Con dos iguales el mismo día gana la pagada con esta cuenta, aunque su id vaya después.
  const e = extractoDe([compra('2026-09-05', 3300, 'Kiosco')]);
  const ctx = ctxDe({
    movimientos: [
      mov({ id: 'tx-a', centavos: 3300, date: '2026-09-05' }),
      mov({ id: 'tx-b', centavos: 3300, date: '2026-09-05', card_id: CUENTA.id }),
    ],
  });
  t.igual('desempata la cuenta', cotejos(e, ctx), ['exacto:tx-b']);

  // Gana el más cercano en fecha, no el primero de la lista.
  const lejos = ctxDe({
    movimientos: [
      mov({ id: 'tx-a', centavos: 3300, date: '2026-09-03' }),
      mov({ id: 'tx-b', centavos: 3300, date: '2026-09-05' }),
    ],
  });
  t.igual('desempata la fecha', cotejos(e, lejos), ['exacto:tx-b']);
}

{
  // Determinista: el orden en que llegan los candidatos no cambia nada.
  const e = extractoDe([
    compra('2026-09-05', 4000, 'Metro'),
    compra('2026-09-05', 4000, 'Metro'),
    compra('2026-09-07', 4000, 'Metro'),
    compra('2026-09-09', 250000, 'Super Nacional'),
    compra('2026-09-11', 9900, 'Kiosco'),
    { asentada: '2026-09-12', centavos: -800000, clase: 'transfer_out', matchKey: 'a:1111', contraparte: '1111' },
  ]);
  const movimientos = [
    mov({ id: 'tx-1', centavos: 4000, date: '2026-09-06' }),
    mov({ id: 'tx-2', centavos: 4000, date: '2026-09-04' }),
    mov({ id: 'tx-3', centavos: 4000, date: '2026-09-07', card_id: CUENTA.id }),
    mov({ id: 'tx-4', centavos: 4000, date: '2026-09-05', author_id: 'ana', author_name: 'Ana' }),
    mov({ id: 'tx-5', centavos: 262000, date: '2026-09-09', esCompraDelSuper: true }),
    mov({ id: 'tx-6', centavos: 9900, date: '2026-09-20', source: 'ai' }),
    mov({ id: 'tx-7', centavos: 9900, date: '2026-09-25', source: 'ai' }),
  ];
  const pagosDeTarjeta = [
    pago({ id: 'pago-b', centavos: 800000, date: '2026-09-13' }),
    pago({ id: 'pago-a', centavos: 800000, date: '2026-09-14' }),
  ];
  const base = JSON.stringify(cotejos(e, ctxDe({ movimientos, pagosDeTarjeta })));
  let iguales = 0;
  for (let s = 1; s <= 25; s++) {
    const r = JSON.stringify(cotejos(e, ctxDe({
      movimientos: mezclar(movimientos, s), pagosDeTarjeta: mezclar(pagosDeTarjeta, s * 7),
    })));
    if (r === base) iguales++;
  }
  t.igual('25 órdenes distintos de los candidatos, el mismo resultado', iguales, 25);
  t.igual('y el resultado es el esperado', JSON.parse(base), [
    'exacto:tx-1', 'exacto:tx-2', 'exacto:tx-3', 'posible:tx-5/super', 'posible:tx-6/correo,tx-7/correo',
    'exacto:pago-b',
  ]);
}

// ─── categoriaPara ───────────────────────────────────────────────────────────

{
  const shell: Pick<LineaDeExtracto, 'clase' | 'comercio' | 'descripcion' | 'matchKey'> =
    { clase: 'purchase', comercio: 'Shell', descripcion: 'Shell', matchKey: 'shell' };
  const aprendido = (category: string, created_at: string, subcategory: string | null = null): Aprendido =>
    ({ match_key: 'shell', decision: 'expense', type: 'expense', category, subcategory, ledger_id: 'personal', created_at });

  t.igual('la regla: Shell es combustible', categoriaPara(shell, 'expense', PERSONAL, [], []),
    { categoria: 'Transporte', subcategoria: 'Combustible', origen: 'regla' });
  t.igual('lo aprendido le gana a la regla', categoriaPara(shell, 'expense', PERSONAL, [aprendido('Hogar', '2026-08-01')], []),
    { categoria: 'Hogar', subcategoria: null, origen: 'historial' });
  t.igual('gana lo aprendido más reciente',
    categoriaPara(shell, 'expense', PERSONAL, [aprendido('Hogar', '2026-08-01'), aprendido('Salud', '2026-08-20')], []),
    { categoria: 'Salud', subcategoria: null, origen: 'historial' });
  t.igual('lo aprendido que no existe en este libro no cuenta',
    categoriaPara(shell, 'expense', PERSONAL, [aprendido('Materiales', '2026-08-20')], []),
    { categoria: 'Transporte', subcategoria: 'Combustible', origen: 'regla' });
  t.igual('lo aprendido de un ingreso no sirve para un gasto',
    categoriaPara(shell, 'expense', PERSONAL, [{ ...aprendido('Salario', '2026-08-20'), type: 'income' }], []),
    { categoria: 'Transporte', subcategoria: 'Combustible', origen: 'regla' });

  // El primer import: lo anotado a mano con el comercio en la descripción.
  const pya = { clase: 'purchase' as const, comercio: 'PedidosYa', descripcion: 'PedidosYa', matchKey: 'pedidosya' };
  const propios = [
    mov({ id: 'tx-1', centavos: 1, date: '2026-09-01', description: 'Pedidos Ya almuerzo', category: 'Alimentación', subcategory: 'Almuerzo' }),
    mov({ id: 'tx-2', centavos: 1, date: '2026-09-03', description: 'PedidosYa', category: 'Hogar', author_id: 'ana' }),
  ];
  t.igual('primer import: lo propio con el comercio en la descripción',
    categoriaPara(pya, 'expense', PERSONAL, [], propios, { yo: 'yo' }),
    { categoria: 'Alimentación', subcategoria: 'Almuerzo', origen: 'historial' });

  const regla = (comercio: string) =>
    categoriaPara({ clase: 'purchase', comercio, descripcion: comercio, matchKey: comercio.toLowerCase() }, 'expense', PERSONAL, [], []);
  t.igual('el súper va a Alimentación sin subcategoría', regla('Supermercado Bravo'),
    { categoria: 'Alimentación', subcategoria: null, origen: 'regla' });
  t.igual('Uber Eats es comida, no taxi', regla('UBER EATS'), { categoria: 'Alimentación', subcategoria: null, origen: 'regla' });
  t.igual('Uber solo es taxi', regla('UBER TRIP'), { categoria: 'Transporte', subcategoria: 'Taxi / Uber', origen: 'regla' });
  t.igual('con el punto: APPLE.COM', regla('APPLE.COM/BILL'), { categoria: 'Suscripciones', subcategoria: 'Software', origen: 'regla' });
  // Streaming existe colgando de Entretenimiento, no de Suscripciones: la sub
  // se resuelve por SU padre, no por el nombre suelto.
  t.igual('la sub se resuelve por su padre', regla('NETFLIX'),
    { categoria: 'Suscripciones', subcategoria: null, origen: 'regla' });
  const sinSuscripciones = PERSONAL.filter(c => c.name !== 'Suscripciones' && c.parent_id !== 'personal:Suscripciones');
  t.igual('sin Suscripciones, la segunda opción',
    categoriaPara({ clase: 'purchase', comercio: 'NETFLIX', descripcion: 'NETFLIX', matchKey: 'netflix' }, 'expense', sinSuscripciones, [], []),
    { categoria: 'Entretenimiento', subcategoria: 'Streaming', origen: 'regla' });
  t.igual('nadie lo reconoce: el "Otros" del tipo', regla('Ferreteria Sol'),
    { categoria: 'Otros personal', subcategoria: null, origen: 'respaldo' });
  t.igual('en una transferencia, "Carol" es una persona y no una farmacia',
    categoriaPara({ clase: 'transfer_out', comercio: 'Carolina P.', descripcion: 'Transferencia a Carolina P. (··5555)', matchKey: 'a:5555' },
      'expense', PERSONAL, [], []),
    { categoria: 'Otros personal', subcategoria: null, origen: 'respaldo' });

  const cargo = { clase: 'fee' as const, comercio: '', descripcion: 'Cargo mensual de la tarjeta de débito', matchKey: 'cargo mensual' };
  const dgii = { clase: 'fee' as const, comercio: '', descripcion: 'Impuesto DGII 0.15%', matchKey: 'impuesto dgii' };
  t.igual('un cargo, sin dónde ponerlo y sin crearla: al "Otros"', categoriaPara(cargo, 'expense', PERSONAL, [], []),
    { categoria: 'Otros personal', subcategoria: null, origen: 'respaldo' });
  t.igual('un cargo con el interruptor: Cargos bancarios, nueva',
    categoriaPara(cargo, 'expense', PERSONAL, [], [], { crearCargosBancarios: true }),
    { categoria: 'Cargos bancarios', subcategoria: null, origen: 'regla', nueva: true });
  const conCargos = [...PERSONAL, cat('personal', 'Comisiones bancarias', 'expense')];
  t.igual('si ya tiene "Comisiones bancarias", va ahí y no se crea nada',
    categoriaPara(cargo, 'expense', conCargos, [], [], { crearCargosBancarios: true }),
    { categoria: 'Comisiones bancarias', subcategoria: null, origen: 'regla' });
  t.igual('el impuesto DGII va a Impuestos si el libro lo tiene', categoriaPara(dgii, 'expense', NEGOCIO, [], []),
    { categoria: 'Impuestos', subcategoria: null, origen: 'regla' });
  const negocioCargo = categoriaPara(cargo, 'expense', NEGOCIO, [], []);
  t.cierto('un cargo NUNCA va a "Comisiones", que es de ingreso', negocioCargo?.categoria !== 'Comisiones');
  t.igual('…va al "Otros negocio"', negocioCargo, { categoria: 'Otros negocio', subcategoria: null, origen: 'respaldo' });

  const interes = { clase: 'interest' as const, comercio: '', descripcion: 'Intereses de la cuenta', matchKey: 'intereses' };
  t.igual('los intereses van a Inversiones › Intereses', categoriaPara(interes, 'income', PERSONAL, [], []),
    { categoria: 'Inversiones', subcategoria: 'Intereses', origen: 'regla' });
  t.igual('sin Inversiones, al "Otros ingreso"', categoriaPara(interes, 'income', NEGOCIO, [], []),
    { categoria: 'Otros ingreso negocio', subcategoria: null, origen: 'respaldo' });
  t.igual('sin ninguna categoría de ese tipo: null', categoriaPara(shell, 'expense', [], [], []), null);
}

// ─── elegirCuenta ────────────────────────────────────────────────────────────

{
  const e = extractoDe([compra('2026-09-01', 100, 'Kiosco')]);
  const elegida = (cards: Card[], pedida?: string) => {
    const r = elegirCuenta(cards, e, pedida);
    if (r.tipo === 'varias') return `varias:${r.candidatas.map(c => c.id).join(',')}`;
    if (r.tipo === 'ninguna') return `ninguna:${r.propuesta.name}`;
    return `${r.tipo}:${r.card.id}`;
  };
  t.igual('una por tipo y últimos 4', elegida(TARJETAS), 'una:card-cuenta');
  t.igual('la Visa Popular con los mismos 4 no es la cuenta',
    elegida([card('visa-pop', { name: 'Visa Popular', kind: 'credit', last4: '3456', issuer: 'Popular' })]),
    'ninguna:Cuenta Digital Libre');
  t.igual('desempata el emisor', elegida([
    card('a', { last4: '3456', issuer: 'Otro' }), card('b', { last4: '3456', issuer: 'BPD' }),
  ]), 'una:b');
  t.igual('después el tipo', elegida([
    card('a', { last4: '3456', kind: 'checking' }), card('b', { last4: '3456', kind: 'savings' }),
  ]), 'una:b');
  t.igual('después la que no está archivada', elegida([
    card('a', { last4: '3456', archived: true }), card('b', { last4: '3456' }),
  ]), 'una:b');
  t.igual('una archivada sola igual sirve', elegida([card('a', { last4: '3456', archived: true })]), 'una:a');
  t.igual('dos que empatan en todo: que elija la persona', elegida([
    card('b', { name: 'Beta', last4: '3456' }), card('a', { name: 'Alfa', last4: '3456' }),
  ]), 'varias:a,b');
  t.igual('pedida con otros 4: bloqueada', elegida(TARJETAS, OTRA.id), 'bloqueada:card-otra');
  t.igual('pedida que es una tarjeta de crédito: bloqueada', elegida(TARJETAS, VISA.id), 'bloqueada:card-visa');
  t.igual('pedida sin últimos 4: se completan', elegida([...TARJETAS, card('sin', {})], 'sin'), 'completar:sin');
  t.igual('pedida que no existe: se elige sola', elegida(TARJETAS, 'no-existe'), 'una:card-cuenta');
  const nueva = elegirCuenta([], e);
  t.igual('ninguna: se propone con el nombre del producto', nueva, {
    tipo: 'ninguna',
    propuesta: { name: 'Cuenta Digital Libre', kind: 'savings', last4: '3456', issuer: 'Banco Popular', color: 'blue' },
  });
  t.igual('si el nombre choca, lleva los últimos 4',
    elegida([card('x', { name: 'Cuenta Digital Libre', last4: '0001' })]), 'ninguna:Cuenta Digital Libre ··3456');
  t.igual('título en minúscula con las palabras chicas', nombreDeProducto('CUENTA DE AHORRO EN PESOS'),
    'Cuenta de Ahorro en Pesos');
}

// ─── El estado de ejemplo ────────────────────────────────────────────────────
//
// Una línea de cada clase, más las parejas compra–devolución y lo ya anotado.

const MOVS: Mov[] = [
  /* 0 */ compra('2026-09-01', 150000, 'Shell'),
  /* 1 */ { asentada: '2026-09-02', centavos: -15000, clase: 'fee', descripcion: 'Cargo mensual de la tarjeta de débito', matchKey: 'cargo mensual' },
  /* 2 */ { asentada: '2026-09-02', centavos: -225, clase: 'fee', descripcion: 'Impuesto DGII 0.15%', matchKey: 'impuesto dgii' },
  /* 3 */ { asentada: '2026-09-03', centavos: -500000, clase: 'withdrawal', descripcion: 'Retiro de efectivo', matchKey: 'retiro' },
  /* 4 */ { asentada: '2026-09-04', centavos: 1000000, clase: 'deposit', descripcion: 'Depósito', matchKey: 'dep:acte' },
  /* 5 */ { asentada: '2026-09-05', centavos: 300000, clase: 'transfer_in', descripcion: 'Transferencia de Luis P. (··9999)', matchKey: 'de:9999', contraparte: '9999' },
  /* 6 */ { asentada: '2026-09-06', centavos: -800000, clase: 'transfer_out', descripcion: 'Transferencia a tu tarjeta (··1111)', matchKey: 'a:1111', contraparte: '1111' },
  /* 7 */ { asentada: '2026-09-07', centavos: -200000, clase: 'transfer_out', descripcion: 'Transferencia a tu cuenta (··7777)', matchKey: 'a:7777', contraparte: '7777' },
  /* 8 */ { asentada: '2026-09-08', centavos: -120000, clase: 'transfer_out', descripcion: 'Transferencia a Pedro R. (··5555)', matchKey: 'a:5555', contraparte: '5555' },
  /* 9 */ { asentada: '2026-09-09', centavos: -100000, clase: 'own_transfer', descripcion: 'Entre tus cuentas' },
  /* 10 */ { asentada: '2026-09-10', centavos: 1234, clase: 'interest', descripcion: 'Intereses de la cuenta', matchKey: 'intereses' },
  /* 11 */ compra('2026-09-11', 500000, 'Tienda Online'),
  /* 12 */ { asentada: '2026-09-12', centavos: 200000, clase: 'refund', comercio: 'Tienda Online', descripcion: 'Devolución de Tienda Online', matchKey: 'tienda online', devolucionDe: 11 },
  /* 13 */ compra('2026-09-13', 300000, 'Zapateria Centro'),
  /* 14 */ { asentada: '2026-09-14', centavos: 300000, clase: 'refund', comercio: 'Zapateria Centro', descripcion: 'Devolución de Zapateria Centro', matchKey: 'zapateria centro', devolucionDe: 13 },
  /* 15 */ { asentada: '2026-09-15', centavos: -5000, clase: 'other', descripcion: 'Movimiento del banco' },
  /* 16 */ { asentada: '2026-09-16', centavos: 7000, clase: 'refund', comercio: 'Tienda Lejana', descripcion: 'Devolución de Tienda Lejana', matchKey: 'tienda lejana' },
  /* 17 */ compra('2026-09-18', 95000, 'PedidosYa'),
  /* 18 */ compra('2026-09-19', 40000, 'Farmacia Uno'),
  /* 19 */ compra('2026-09-25', 60000, 'PedidosYa'),
];
const EXTRACTO = extractoDe(MOVS);
const CLAVE = EXTRACTO.lineas.map(l => l.clave);
const CTX = ctxDe({
  movimientos: [
    mov({ id: 'tx-pya', centavos: 95000, date: '2026-09-18', description: 'PedidosYa', category: 'Alimentación', subcategory: 'Almuerzo' }),
    mov({ id: 'tx-ana', centavos: 40000, date: '2026-09-19', description: 'Farmacia', category: 'Salud', author_id: 'ana', author_name: 'Ana' }),
    mov({ id: 'tx-raro', centavos: 5200, date: '2026-09-16', description: 'Algo raro', category: 'Hogar' }),
  ],
});
const PLAN = planearImportacion(EXTRACTO, CTX, OP);

function linea(plan: Plan, i: number) {
  return plan.lineas[i];
}

function resumenDe(plan: Plan, i: number): string {
  const l = linea(plan, i);
  const cat = l.categoria ? ` ${T.textoDeCategoria(l.categoria, l.subcategoria)}` : '';
  return `${l.decision}${cat}${l.motivo ? ` (${l.motivo})` : ''}`;
}

// ─── planearImportacion: lo que le toca a cada clase ─────────────────────────

t.igual('lo que se sugiere para cada línea', PLAN.lineas.map((_, i) => resumenDe(PLAN, i)), [
  'expense Transporte › Combustible',
  'expense Cargos bancarios',
  'expense Cargos bancarios',
  'skipped (retiro)',
  'pending (deposito)',
  'pending (transferencia-recibida)',
  'card_payment (pago-de-tarjeta)',
  'skipped (entre-cuentas)',
  'pending (transferencia-enviada)',
  'skipped (entre-cuentas)',
  'income Inversiones › Intereses',
  'expense Otros personal',
  'netted (descontada)',
  'skipped (devuelta)',
  'skipped (devuelta)',
  'pending (otro)',
  'pending (devolucion)',
  'linked (ya-estaba)',
  'pending (posible)',
  'expense Alimentación › Almuerzo',
]);
t.igual('el pago de tarjeta va a la Visa por sus últimos 4', linea(PLAN, 6).tarjetaId, VISA.id);
t.cierto('los cargos van a una categoría NUEVA', linea(PLAN, 1).categoriaNueva && linea(PLAN, 2).categoriaNueva);
t.igual('la compra con devolución se guarda por su neto', linea(PLAN, 11).netoCentavos, 300000);
t.igual('…y lo dice en la descripción', linea(PLAN, 11).descripcion, 'Tienda Online (con devolución)');
t.igual('la devolución apunta a su compra', linea(PLAN, 12).descuentaDe, CLAVE[11]);
t.igual('lo enlazado en el mismo estado enseña al resto del comercio', linea(PLAN, 19).origenCategoria, 'historial');
t.igual('lo que quedó para revisar, cada uno en su grupo', PLAN.enRevision, {
  [CLAVE[4]]: 'depositos',
  [CLAVE[5]]: 'te-transfirieron',
  [CLAVE[8]]: 'transferiste',
  [CLAVE[15]]: 'otros',
  [CLAVE[16]]: 'devoluciones',
  [CLAVE[18]]: 'ya-anotado',
});
t.igual('la pareja se pregunta con su nombre', vistaDelPlan(PLAN).secciones[0].grupos
  .find(g => g.id === 'ya-anotado')?.filas[0].motivo, '¿Es el que anotó Ana el 19 sep?');

{
  // Una devolución más grande que su compra no se descuenta: el neto no puede ser cero ni negativo.
  const e = extractoDe([
    compra('2026-09-01', 10000, 'Tienda X'),
    { asentada: '2026-09-02', centavos: 12000, clase: 'refund', comercio: 'Tienda X', matchKey: 'tienda x', devolucionDe: 0 },
  ]);
  const p = planearImportacion(e, ctxDe(), OP);
  t.igual('devolución mayor que la compra: la compra entera y la devolución a revisar',
    [resumenDe(p, 0), resumenDe(p, 1)], ['expense Otros personal', 'pending (devolucion)']);
}

{
  // Lo aprendido de importaciones anteriores, para transferencias y depósitos.
  const aprendido: Aprendido[] = [
    { match_key: 'a:5555', decision: 'expense', type: 'expense', category: 'Hogar', subcategory: null, ledger_id: 'personal', created_at: '2026-08-10T00:00:00Z' },
    { match_key: 'dep:acte', decision: 'income', type: 'income', category: 'Salario', subcategory: null, ledger_id: 'personal', created_at: '2026-08-01T00:00:00Z' },
    { match_key: 'dep:acte', decision: 'skipped', type: null, category: null, subcategory: null, ledger_id: null, created_at: '2026-08-15T00:00:00Z' },
    { match_key: 'de:9999', decision: 'linked', type: 'income', category: 'Salario', subcategory: null, ledger_id: 'personal', created_at: '2026-08-10T00:00:00Z' },
  ];
  const p = planearImportacion(EXTRACTO, ctxDe({ ...CTX, aprendido }), OP);
  t.igual('la transferencia a la misma persona: como la última vez', resumenDe(p, 8), 'expense Hogar');
  t.igual('el depósito: gana lo último aprendido (sin anotar)', resumenDe(p, 4), 'skipped (aprendida)');
  t.igual('lo recibido que se enlazó con un ingreso enseña ingreso', resumenDe(p, 5), 'income Salario');
}

{
  // Frente a importaciones anteriores.
  const e = extractoDe([
    compra('2026-09-01', 10000, 'Kiosco'),
    compra('2026-09-02', 20000, 'Kiosco'),
    compra('2026-09-03', 30000, 'Kiosco'),
    { asentada: '2026-09-04', centavos: -50000, clase: 'withdrawal', descripcion: 'Retiro de efectivo', matchKey: 'retiro' },
    compra('2026-09-05', 40000, 'Kiosco'),
  ]);
  const c = e.lineas.map(l => l.clave);
  const ctx = ctxDe({
    lineasPrevias: [
      previa(c[0], { transaction_id: 'tx-1' }),
      previa(c[1], { decision: 'skipped' }),
      previa(c[2], { transaction_id: null }),
      previa(c[3], { decision: 'skipped', kind: 'withdrawal' }),
      previa(c[4], { account_last4: '9999', transaction_id: 'tx-otra' }),
    ],
  });
  const p = planearImportacion(e, ctx, OP);
  t.igual('cerrada, sin anotar antes, borrada, retiro sin anotar antes y una de otra cuenta',
    p.lineas.map((_, i) => resumenDe(p, i)), [
      'pending (ya-importada)',
      'skipped (sin-anotar-antes)',
      'pending (borrada)',
      'skipped (sin-anotar-antes)',
      'expense Otros personal',
    ]);
  t.cierto('la cerrada queda bloqueada', p.lineas[0].bloqueada);
  t.igual('la borrada va a su grupo', p.enRevision[c[2]], 'borrados');
  const v = vistaDelPlan(p);
  t.igual('la sección de ya importados', v.secciones.map(s => s.id), ['revisar', 'se-anotan', 'no-se-anotan', 'ya-importados']);
  t.igual('…con su nota', v.secciones[3].nota, '1 movimiento de este estado ya se importó.');

  const otraVez = aplicarCambio(p, 'borrados', { tipo: 'anotar-de-nuevo' });
  t.igual('"Anotar de nuevo" la vuelve a anotar como estaba', resumenDe(otraVez, 2), 'expense Otros personal');
  t.igual('…y se queda en su lugar, decidida', vistaDelPlan(otraVez).secciones[0].grupos[0].nota, '1 de 1 decidido');

  const conRetiros = aplicarCambio(p, null, { tipo: 'retiros-como-gasto', valor: true });
  t.igual('el interruptor pisa también el retiro que quedó sin anotar', resumenDe(conRetiros, 3), 'expense Otros personal');

  // Lo que dice la importación anterior va antes que un enlace exacto: se ofrece, no se asigna.
  const reanotadas = planearImportacion(e, ctxDe({
    ...ctx,
    movimientos: [
      mov({ id: 'tx-de-nuevo', centavos: 30000, date: '2026-09-03', description: 'Kiosco' }),
      mov({ id: 'tx-saltada', centavos: 20000, date: '2026-09-02', description: 'Kiosco' }),
    ],
  }), OP);
  t.igual('la borrada y anotada otra vez a mano: igual se pregunta', [resumenDe(reanotadas, 1), resumenDe(reanotadas, 2)],
    ['skipped (sin-anotar-antes)', 'pending (borrada)']);
  t.igual('…con el movimiento a mano primero, para enlazar', hojaDeLinea(reanotadas, c[2])?.candidatos.map(x => x.texto),
    ['Kiosco · 3 sep', 'Kiosco · 2 sep']);

  // Todo ya importado: lo dice el botón, con la fecha de la última vez.
  const todas = ctxDe({ lineasPrevias: c.map(k => previa(k, { transaction_id: `tx-${k}` })) });
  const vt = vistaDelPlan(planearImportacion(e, todas, OP));
  t.igual('todo importado antes', vt.boton, { texto: 'Este estado de cuenta ya se importó el 2 oct.', habilitado: false, n: 0 });
  const sinNada = vistaDelPlan(planearImportacion(extractoDe([
    { asentada: '2026-09-04', centavos: -50000, clase: 'withdrawal', descripcion: 'Retiro de efectivo', matchKey: 'retiro' },
  ]), ctxDe(), OP));
  t.igual('nada nuevo', sinNada.boton, { texto: 'No hay nada nuevo para importar', habilitado: false, n: 0 });
}

// ─── aplicarCambio ───────────────────────────────────────────────────────────

{
  // La devolución sigue a su compra.
  const sinCompra = aplicarCambio(PLAN, CLAVE[11], { tipo: 'decidir', decision: 'skipped' });
  t.igual('compra sin anotar: su devolución tampoco', [resumenDe(sinCompra, 11), resumenDe(sinCompra, 12)],
    ['skipped (elegida)', 'skipped (sigue-a-su-compra)']);
  t.igual('…y la compra ya no lleva neto', linea(sinCompra, 11).netoCentavos, null);
  const deVuelta = aplicarCambio(sinCompra, CLAVE[11], { tipo: 'decidir', decision: 'expense' });
  t.igual('compra anotada otra vez: se vuelve a descontar', resumenDe(deVuelta, 12), 'netted (descontada)');

  const comoIngreso = aplicarCambio(PLAN, CLAVE[12], { tipo: 'decidir', decision: 'income' });
  t.igual('la devolución como ingreso: la compra va entera', [linea(comoIngreso, 11).netoCentavos, linea(comoIngreso, 11).descripcion],
    [null, 'Tienda Online']);
  t.igual('…y la devolución lleva un ingreso', resumenDe(comoIngreso, 12), 'income Otros ingreso personal');

  const ambas = aplicarCambio(PLAN, CLAVE[13], { tipo: 'decidir', decision: 'expense' });
  t.igual('compra y devolución iguales, la compra anotada: la devolución se pregunta',
    [resumenDe(ambas, 13), resumenDe(ambas, 14)], ['expense Otros personal', 'pending (devolucion)']);
  t.igual('…en Devoluciones', ambas.enRevision[CLAVE[14]], 'devoluciones');
}

{
  // Los botones de grupo: solo lo que sigue sin decidir.
  const yaUno = aplicarCambio(PLAN, CLAVE[4], { tipo: 'decidir', decision: 'skipped' });
  const p1 = aplicarCambio(yaUno, 'depositos', { tipo: 'decidir', decision: 'income' });
  t.igual('el botón de grupo no pisa lo ya decidido', resumenDe(p1, 4), 'skipped (elegida)');
  const p2 = aplicarCambio(PLAN, 'depositos', { tipo: 'decidir', decision: 'income' });
  t.igual('Depósitos: son ingresos', resumenDe(p2, 4), 'income Otros ingreso personal');
  const p3 = aplicarCambio(PLAN, 'transferiste', { tipo: 'decidir', decision: 'expense' });
  t.igual('Transferiste: son gastos', resumenDe(p3, 8), 'expense Otros personal');
  const p4 = aplicarCambio(PLAN, 'te-transfirieron', { tipo: 'decidir', decision: 'skipped' });
  t.igual('Te transfirieron: no anotar', resumenDe(p4, 5), 'skipped (elegida)');
  t.cierto('un gasto en el grupo de lo recibido no vale', aplicarCambio(PLAN, 'te-transfirieron', { tipo: 'decidir', decision: 'expense' }) === PLAN);
  t.cierto('un gasto en una línea de crédito no cambia nada', aplicarCambio(PLAN, CLAVE[4], { tipo: 'decidir', decision: 'expense' }) === PLAN);

  const v = vistaDelPlan(p2);
  const depositos = v.secciones[0].grupos.find(g => g.id === 'depositos');
  t.igual('decidido, se queda en su lugar', depositos?.filas.map(f => f.clave), [CLAVE[4]]);
  t.igual('…con la píldora elegida', depositos?.filas[0].acciones.map(a => [a.texto, a.elegida]),
    [['Es ingreso', true], ['Es plata mía', false]]);
  t.igual('…y sin los botones del grupo', depositos?.botones, []);
  t.igual('…y la cuenta del grupo', depositos?.nota, '1 de 1 decidido');
}

{
  // "Es el mismo" y "Es otro".
  const fila = vistaDelPlan(PLAN).secciones[0].grupos.find(g => g.id === 'ya-anotado')?.filas[0];
  const mismo = fila?.acciones.find(a => a.id === 'mismo');
  t.igual('la fila ofrece "Es el mismo" y "Es otro"', fila?.acciones.map(a => a.texto), ['Es el mismo', 'Es otro']);
  t.igual('…con el candidato para mostrar', fila?.candidato, { texto: 'Farmacia · 19 sep', centavos: 40000 });
  const enlazado = mismo?.cambio ? aplicarCambio(PLAN, CLAVE[18], mismo.cambio) : PLAN;
  t.igual('Es el mismo: enlazada con lo de la pareja', resumenDe(enlazado, 18), 'linked (ya-estaba)');
  t.igual('…y va al pedido', armarPedido(enlazado).lineas[18].transaction_id, 'tx-ana');
  const otro = aplicarCambio(PLAN, CLAVE[18], { tipo: 'es-otro' });
  t.igual('Es otro: un gasto nuevo, por la regla de la farmacia', resumenDe(otro, 18), 'expense Salud › Farmacia');

  const soltada = aplicarCambio(PLAN, CLAVE[17], { tipo: 'es-otro' });
  t.igual('Es otro en algo que ya estaba: se anota nuevo', resumenDe(soltada, 17), 'expense Alimentación › Almuerzo');
  t.igual('…y la otra de PedidosYa igual aprende de lo anotado a mano', resumenDe(soltada, 19), 'expense Alimentación › Almuerzo');
}

{
  // Enlazar a mano.
  const lista = candidatosParaEnlazar(PLAN, CLAVE[15]);
  t.igual('los candidatos de una línea: cerca en la fecha, a cualquier monto, libres',
    lista.map(c => (c.tipo === 'movimiento' ? c.movimiento.id : c.pago.id)), ['tx-raro']);
  t.cierto('lo que ya explica otra línea no se ofrece',
    !candidatosParaEnlazar(PLAN, CLAVE[19]).some(c => c.tipo === 'movimiento' && c.movimiento.id === 'tx-pya'));
  const manual = aplicarCambio(PLAN, CLAVE[15], { tipo: 'enlazar', candidato: { tipo: 'movimiento', id: 'tx-raro' } });
  t.igual('enlazada a mano', resumenDe(manual, 15), 'linked (ya-estaba)');
  t.cierto('no se puede enlazar con lo que ya es de otra línea',
    aplicarCambio(PLAN, CLAVE[19], { tipo: 'enlazar', candidato: { tipo: 'movimiento', id: 'tx-pya' } }) === PLAN);
  const conRegalo = planearImportacion(EXTRACTO, ctxDe({
    ...CTX,
    movimientos: [...CTX.movimientos, mov({ id: 'tx-regalo', centavos: 450000, date: '2026-09-12', description: 'Regalo', category: 'Hogar' })],
  }), OP);
  const compraEnlazada = aplicarCambio(conRegalo, CLAVE[11], { tipo: 'enlazar', candidato: { tipo: 'movimiento', id: 'tx-regalo' } });
  t.igual('la compra enlazada a mano', resumenDe(compraEnlazada, 11), 'linked (ya-estaba)');
  t.igual('la compra ya estaba anotada: su devolución se pregunta', resumenDe(compraEnlazada, 12), 'pending (devolucion)');
}

{
  // La categoría, extendida a las otras del mismo comercio.
  const e = extractoDe([
    compra('2026-09-01', 10000, 'Ferreteria Sol'),
    compra('2026-09-02', 20000, 'Ferreteria Sol'),
    compra('2026-09-03', 30000, 'Ferreteria Sol'),
    compra('2026-09-04', 40000, 'Kiosco'),
  ]);
  const c = e.lineas.map(l => l.clave);
  const p = planearImportacion(e, ctxDe(), OP);
  t.igual('la hoja ofrece pasarla a las otras dos', hojaDeLinea(p, c[0])?.extender,
    { n: 2, texto: 'Usar esta categoría en las otras 2 de Ferreteria Sol' });
  const todas = aplicarCambio(p, c[0], { tipo: 'categoria', categoria: 'Hogar', subcategoria: null, extender: true });
  t.igual('con la casilla: las tres del comercio', [0, 1, 2, 3].map(i => resumenDe(todas, i)),
    ['expense Hogar', 'expense Hogar', 'expense Hogar', 'expense Otros personal']);
  const una = aplicarCambio(p, c[0], { tipo: 'categoria', categoria: 'Hogar', subcategoria: null });
  t.igual('sin la casilla: solo esa', [0, 1].map(i => resumenDe(una, i)), ['expense Hogar', 'expense Otros personal']);
  const elegida = aplicarCambio(p, c[2], { tipo: 'categoria', categoria: 'Salud', subcategoria: 'Farmacia' });
  t.igual('lo elegido a mano no se pisa', hojaDeLinea(elegida, c[0])?.extender?.n, 1);
  const despues = aplicarCambio(elegida, c[0], { tipo: 'categoria', categoria: 'Hogar', subcategoria: null, extender: true });
  t.igual('…ni al extender', resumenDe(despues, 2), 'expense Salud › Farmacia');
  t.cierto('una categoría que no existe no se elige',
    aplicarCambio(p, c[0], { tipo: 'categoria', categoria: 'Materiales', subcategoria: null }) === p);
  const deposito = planearImportacion(extractoDe([
    { asentada: '2026-09-04', centavos: 1000000, clase: 'deposit', descripcion: 'Depósito', matchKey: 'dep:acte' },
  ]), ctxDe(), OP);
  const conCategoria = aplicarCambio(deposito, deposito.lineas[0].clave, { tipo: 'categoria', categoria: 'Salario', subcategoria: null });
  t.igual('elegir una categoría decide anotarla', resumenDe(conCategoria, 0), 'income Salario');
}

{
  // La descripción.
  const escrita = aplicarCambio(PLAN, CLAVE[0], { tipo: 'descripcion', descripcion: '  Gasolina del mes  ' });
  t.igual('la descripción escrita, recortada', linea(escrita, 0).descripcion, 'Gasolina del mes');
  t.igual('…va al pedido', armarPedido(escrita).lineas[0].description, 'Gasolina del mes');
  const borrada = aplicarCambio(escrita, CLAVE[0], { tipo: 'descripcion', descripcion: '' });
  t.igual('vacía vuelve a la del banco', linea(borrada, 0).descripcion, 'Shell');
}

{
  // Los dos interruptores.
  const conRetiros = aplicarCambio(PLAN, null, { tipo: 'retiros-como-gasto', valor: true });
  t.igual('retiros como gasto', resumenDe(conRetiros, 3), 'expense Otros personal');
  const grupo = vistaDelPlan(conRetiros).secciones.find(s => s.id === 'no-se-anotan')?.grupos.find(g => g.id === 'retiro');
  t.igual('el interruptor sigue a mano aunque los retiros se hayan ido', [grupo?.titulo, grupo?.filas.length, grupo?.interruptor?.valor],
    [T.RETIROS_COMO_GASTO, 0, true]);
  const apagado = aplicarCambio(conRetiros, null, { tipo: 'retiros-como-gasto', valor: false });
  t.igual('…y se vuelve atrás', resumenDe(apagado, 3), 'skipped (retiro)');

  const sinCrear = aplicarCambio(PLAN, null, { tipo: 'crear-cargos-bancarios', valor: false });
  t.igual('sin crear Cargos bancarios, los cargos van al "Otros"', [resumenDe(sinCrear, 1), resumenDe(sinCrear, 2)],
    ['expense Otros personal', 'expense Otros personal']);
  t.igual('…y no se pide crearla', armarPedido(sinCrear).categoriasNuevas, undefined);
  const aviso = vistaDelPlan(sinCrear).resumen.avisos.find(a => a.id === 'cargos-bancarios');
  t.igual('el aviso sigue, con el interruptor apagado', aviso?.interruptor?.valor, false);
}

{
  // Cambiar de libro: las categorías se recalculan con las del libro nuevo.
  const aMano = aplicarCambio(PLAN, CLAVE[0], { tipo: 'categoria', categoria: 'Transporte', subcategoria: 'Peaje' });
  const negocio = aplicarCambio(aMano, null, { tipo: 'libro', ledgerId: 'negocio', ledgerName: 'Negocio', categorias: TODAS });
  t.igual('en el libro del negocio', [1, 2, 10, 19].map(i => resumenDe(negocio, i)), [
    'expense Cargos bancarios',
    'expense Impuestos',
    'income Otros ingreso negocio',
    'expense Otros negocio',
  ]);
  t.igual('la elegida que no existe allá vuelve a revisar', resumenDe(negocio, 0), 'pending (categoria-inexistente)');
  t.igual('…en Sin categoría', negocio.enRevision[CLAVE[0]], 'sin-categoria');
  t.igual('…diciendo cuál y dónde', vistaDelPlan(negocio).secciones[0].grupos.find(g => g.id === 'sin-categoria')?.filas[0].motivo,
    '«Transporte» no existe en «Negocio».');
  const vuelta = aplicarCambio(negocio, null, { tipo: 'libro', ledgerId: 'personal', ledgerName: 'Personal', categorias: TODAS });
  t.igual('de vuelta al personal, la elegida vale otra vez', resumenDe(vuelta, 0), 'expense Transporte › Peaje');
  t.igual('…y el pedido va al libro elegido', armarPedido(negocio).cab.ledger_id, 'negocio');
}

{
  // El orden en que llegan los candidatos tampoco cambia el pedido.
  const base = JSON.stringify(armarPedido(PLAN));
  let iguales = 0;
  for (let s = 1; s <= 10; s++) {
    const p = planearImportacion(EXTRACTO, ctxDe({ ...CTX, movimientos: mezclar(CTX.movimientos, s) }), OP);
    if (JSON.stringify(armarPedido(p)) === base) iguales++;
  }
  t.igual('10 órdenes de candidatos, el mismo pedido', iguales, 10);
}

// ─── vistaDelPlan ────────────────────────────────────────────────────────────

{
  const v = vistaDelPlan(PLAN);
  t.igual('las secciones, en su orden', v.secciones.map(s => s.titulo), [
    'Para revisar · 6', 'Se anotan · 6', 'Pagos de tarjeta · 1', 'Ya estaban anotados · 1', 'No se anotan · 6',
  ]);
  t.igual('plegadas las que no piden nada', v.secciones.map(s => s.plegada), [false, false, false, true, true]);
  t.igual('los grupos de Para revisar, en su orden', v.secciones[0].grupos.map(g => g.titulo), [
    'Depósitos · 1', 'Te transfirieron · 1', 'Transferiste · 1', '¿Ya lo anotaste? · 1', 'Devoluciones · 1', 'Sin reconocer · 1',
  ]);
  t.igual('con su pregunta y sus botones', [v.secciones[0].grupos[0].pregunta, v.secciones[0].grupos[0].botones.map(b => b.texto)],
    ['¿Son ingresos o plata tuya que depositaste?', ['Son ingresos', 'Son plata mía']]);
  t.igual('los totales de lo que se anota', v.secciones[1].totales, { ingresosCentavos: 1234, gastosCentavos: 525225 });
  t.igual('los subtítulos de lo que no se anota', v.secciones[4].grupos.map(g => [g.titulo, g.filas.length]), [
    [T.NO_SE_ANOTA.retiro, 1],
    [T.NO_SE_ANOTA['entre-cuentas'], 2],
    [T.NO_SE_ANOTA.devuelta, 2],
    [T.NO_SE_ANOTA.descontada, 1],
  ]);
  t.igual('el interruptor de los retiros', v.secciones[4].grupos[0].interruptor,
    { texto: 'Anotar los retiros como gasto', valor: false, cambio: { tipo: 'retiros-como-gasto', valor: true } });

  t.igual('el resumen', [v.resumen.titulo, v.resumen.subtitulo, v.resumen.insignia], [
    'Ahorros Popular ··3456', 'Banco Popular · 1 sep – 25 sep 2026', 'Cuadra con el banco · 20 movimientos',
  ]);
  t.igual('los conteos del resumen', v.resumen.conteos.map(c => c.texto), [
    'Se anotan 6: 5 en gastos y 1 en ingresos', 'Pagos de tarjeta: 1', 'Ya estaban anotados: 1', 'No se anotan: 6',
  ]);
  t.igual('lo que falta revisar', v.resumen.paraRevisar, 'Para revisar: 6. Si no los decidís, no se anotan.');
  t.igual('el botón', v.boton, { texto: 'Importar 8 movimientos', habilitado: true, n: 8 });
  t.igual('el pie', v.pie, { gastosCentavos: 525225, ingresosCentavos: 1234, sinDecidir: 6 });
  t.igual('los avisos: solo el de Cargos bancarios', v.resumen.avisos.map(a => [a.id, a.texto, a.bloquea]), [
    ['cargos-bancarios', 'En «Personal» no hay una categoría para lo que cobra el banco.', false],
  ]);

  const fila = v.secciones[1].grupos[0].filas[0];
  t.igual('una fila de gasto', fila, {
    clave: CLAVE[0], fecha: '1 sep', descripcion: 'Shell',
    categoria: { texto: 'Transporte › Combustible', categoria: 'Transporte', subcategoria: 'Combustible', notas: [] },
    monto: { centavos: 150000, signo: '−', rol: 'gasto' },
    motivo: null, candidato: null, bloqueada: false, decidida: true, acciones: [],
  });
  const filas = v.secciones[1].grupos[0].filas;
  t.igual('un ingreso va en verde y con +', filas.find(f => f.clave === CLAVE[10])?.monto,
    { centavos: 1234, signo: '+', rol: 'ingreso' });
  t.igual('la compra con devolución, por su neto y avisado', [
    filas.find(f => f.clave === CLAVE[11])?.monto.centavos, filas.find(f => f.clave === CLAVE[11])?.categoria?.notas,
  ], [300000, ['neto de devolución', 'revisá']]);
  t.igual('la categoría nueva, avisada', filas.find(f => f.clave === CLAVE[1])?.categoria?.notas, ['nueva']);
  t.igual('lo que no se anota, apagado y sin repetir la razón', v.secciones[4].grupos[0].filas[0].monto.rol, 'apagado');
  t.igual('el pago de tarjeta dice por qué no es un gasto', v.secciones[2].grupos[0].filas[0].motivo,
    'Pago a Visa Oro ··1111: baja lo que debés, no es un gasto.');
  t.igual('lo que ya estaba dice dónde', v.secciones[3].grupos[0].filas[0].motivo,
    'Ya estaba anotado: «PedidosYa» · 18 sep · vía WhatsApp');

  // Todo decidido: el pie sin la parte de lo que queda.
  t.igual('el texto del pie', T.textoDelPie('RD$ 10.00', 'RD$ 0.00', 0), 'Se suman RD$ 10.00 en gastos y RD$ 0.00 en ingresos.');
  t.igual('el texto del pie con lo que queda', T.textoDelPie('A', 'B', 2),
    'Se suman A en gastos y B en ingresos. 2 quedan sin decidir y no se anotan: para decidirlos después, volvé a subir este PDF; lo ya importado no se repite.');
}

{
  // Los avisos que frenan la importación.
  const sinMigracion = vistaDelPlan(planearImportacion(EXTRACTO, ctxDe({ ...CTX, migracionLista: false }), OP));
  t.igual('sin la migración no se importa', [sinMigracion.resumen.avisos[0].id, sinMigracion.boton.habilitado], ['migracion', false]);
  const enDolares = vistaDelPlan(planearImportacion({ ...EXTRACTO, moneda: 'USD' }, CTX, OP));
  t.igual('en otra moneda tampoco', enDolares.resumen.avisos[0].texto,
    'Este estado de cuenta está en US$ y la app lleva tus cuentas en RD$. Por ahora no se puede importar.');

  const ajena = planearImportacion(EXTRACTO, CTX, { ...OP, cuentaPedida: OTRA.id });
  const va = vistaDelPlan(ajena);
  t.igual('pedida desde otra cuenta: bloqueado', [va.resumen.avisos[0].texto, va.resumen.avisos[0].accion?.texto, va.boton.habilitado],
    ['Este estado de cuenta es de la cuenta ··3456, no de «Ahorro Otro Banco».', 'Usar la que corresponde', false]);
  let tiro = false;
  try { armarPedido(ajena); } catch { tiro = true; }
  t.cierto('…y no se arma el pedido', tiro);
  const corregida = aplicarCambio(ajena, null, { tipo: 'cuenta', cardId: null });
  t.igual('"Usar la que corresponde"', corregida.cuenta.tipo === 'una' && corregida.cuenta.card.id, CUENTA.id);

  const dos = [CUENTA, card('card-gemela', { name: 'Ahorros 2', last4: '3456', issuer: 'Banco Popular' }), VISA];
  const varias = planearImportacion(EXTRACTO, ctxDe({ ...CTX, cards: dos }), OP);
  const vv = vistaDelPlan(varias);
  t.igual('dos cuentas con los mismos 4: se elige', [vv.resumen.avisos[0].id, vv.resumen.avisos[0].opciones.map(o => o.texto), vv.boton.habilitado],
    ['cuenta-varias', ['Ahorros 2 ··3456', 'Ahorros Popular ··3456'], false]);
  const elegida = aplicarCambio(varias, null, vv.resumen.avisos[0].opciones[0].cambio);
  t.igual('…y elegida, se puede importar', [vistaDelPlan(elegida).boton.habilitado, armarPedido(elegida).cab.account_card_id],
    [true, 'card-gemela']);

  const nueva = planearImportacion(EXTRACTO, ctxDe({ ...CTX, cards: [VISA] }), OP);
  const vn = vistaDelPlan(nueva);
  t.igual('sin la cuenta: se crea al importar', [vn.resumen.titulo, vn.resumen.avisos[0].texto, vn.resumen.avisos[0].bloquea], [
    'Cuenta Digital Libre ··3456',
    'No tenés esta cuenta en la Billetera: se crea «Cuenta Digital Libre ··3456» al importar.',
    false,
  ]);
  const pn = armarPedido(nueva);
  t.igual('…el pedido trae la cuenta nueva', [pn.cab.account_card_id, pn.cuentaNueva?.name, pn.cuentaNueva?.last4],
    [null, 'Cuenta Digital Libre', '3456']);

  const sinUltimos = card('card-sin', { name: 'Mi ahorro' });
  const completar = planearImportacion(EXTRACTO, ctxDe({ ...CTX, cards: [sinUltimos, VISA] }), { ...OP, cuentaPedida: 'card-sin' });
  t.igual('pedida sin últimos 4: se le guardan', armarPedido(completar).completarLast4, { card_id: 'card-sin', last4: '3456' });
  t.igual('…y se avisa', vistaDelPlan(completar).resumen.avisos[0].texto,
    '«Mi ahorro» no tiene los últimos 4 de la cuenta: se le guarda ··3456 al importar.');

  t.igual('el libro sugerido: el del último movimiento pagado con la cuenta', libroSugerido(EXTRACTO, ctxDe({
    movimientos: [
      mov({ id: 'a', centavos: 1, date: '2026-09-01', card_id: CUENTA.id, ledger_id: 'personal' }),
      mov({ id: 'b', centavos: 1, date: '2026-09-20', card_id: CUENTA.id, ledger_id: 'negocio' }),
      mov({ id: 'c', centavos: 1, date: '2026-09-25', card_id: VISA.id, ledger_id: 'otro' }),
    ],
  })), 'negocio');
  t.igual('sin ninguno, null', libroSugerido(EXTRACTO, CTX), null);
}

// ─── hojaDeLinea ─────────────────────────────────────────────────────────────

{
  const compraH = hojaDeLinea(PLAN, CLAVE[0]);
  t.igual('la hoja de una compra', [compraH?.titulo, compraH?.fechas, compraH?.opciones.map(o => o.texto)], [
    '¿Qué hacemos con este movimiento?', 'Banco: 1 sep · Compra: 1 sep', ['Gasto', 'Pago de tarjeta', 'No anotar'],
  ]);
  t.igual('…con por qué esa categoría', compraH?.categoria,
    { tipo: 'expense', categoria: 'Transporte', subcategoria: 'Combustible', porque: 'Sugerida por el nombre del comercio.' });
  t.igual('la de lo aprendido', hojaDeLinea(PLAN, CLAVE[19])?.categoria?.porque, 'Sugerida porque la última vez la pusiste ahí.');
  t.igual('la nueva', hojaDeLinea(PLAN, CLAVE[1])?.categoria?.porque, 'Se crea al importar.');
  t.igual('la genérica', hojaDeLinea(PLAN, CLAVE[11])?.categoria?.porque, 'No se reconoció: va en Otros personal.');
  const deposito = hojaDeLinea(PLAN, CLAVE[4]);
  t.igual('un depósito: solo lo que vale para un crédito', [deposito?.opciones.map(o => o.id), deposito?.categoria],
    [['income', 'skipped'], null]);
  t.igual('la devolución descontada', hojaDeLinea(PLAN, CLAVE[12])?.opciones.map(o => [o.id, o.elegida]),
    [['income', false], ['netted', true], ['skipped', false]]);
  const pagoH = hojaDeLinea(PLAN, CLAVE[6]);
  t.igual('el pago de tarjeta con su tarjeta elegida', pagoH?.tarjetas.map(x => [x.texto, x.elegida]), [['Visa Oro ··1111', true]]);
  const otraH = hojaDeLinea(PLAN, CLAVE[15]);
  t.igual('"Ya está anotado" con su candidato', [otraH?.opciones.map(o => o.id), otraH?.candidatos.map(c => [c.texto, c.detalle, c.centavos])],
    [['expense', 'linked', 'card_payment', 'skipped'], [['Algo raro · 16 sep', 'vía WhatsApp · Hogar', 5200]]]);

  const cerrada = planearImportacion(EXTRACTO, ctxDe({ ...CTX, lineasPrevias: [previa(CLAVE[0], { transaction_id: 'tx-v' })] }), OP);
  const h = hojaDeLinea(cerrada, CLAVE[0]);
  t.igual('una ya importada no se toca', [h?.bloqueada, h?.opciones.length, h?.monto.rol], [true, 0, 'apagado']);
  t.cierto('…ni con un cambio', aplicarCambio(cerrada, CLAVE[0], { tipo: 'decidir', decision: 'skipped' }) === cerrada);
}

// ─── armarPedido ─────────────────────────────────────────────────────────────

{
  const p = armarPedido(PLAN);
  t.igual('la cabecera', p.cab, {
    bank: 'popular', last4: '3456', account_card_id: CUENTA.id, ledger_id: 'personal',
    opening_cents: SALDO_INICIAL, closing_cents: EXTRACTO.saldoFinalCentavos, line_count: 20,
  });
  t.igual('van TODAS las líneas, en orden, con los centavos del banco', p.lineas.map(l => [l.posted, l.cents, l.balance]),
    EXTRACTO.lineas.map(l => [l.asentada, l.centavos, l.saldoCentavos]));
  t.igual('lo que sigue sin decidir va como pending', [4, 5, 8, 15, 16, 18].map(i => p.lineas[i].decision),
    ['pending', 'pending', 'pending', 'pending', 'pending', 'pending']);
  t.igual('un gasto lleva categoría y descripción, sin montos en decimales', p.lineas[0], {
    posted: '2026-09-01', date: '2026-09-01', cents: -150000, balance: SALDO_INICIAL - 150000, kind: 'purchase',
    decision: 'expense', match_key: 'shell', category: 'Transporte', subcategory: 'Combustible', description: 'Shell',
  });
  t.igual('la compra por su neto y la devolución que se le descuenta', [p.lineas[11].net_cents, p.lineas[12].decision, p.lineas[12].nets_key],
    [300000, 'netted', CLAVE[11]]);
  t.igual('el pago de tarjeta', [p.lineas[6].decision, p.lineas[6].credit_card_id], ['card_payment', VISA.id]);
  t.igual('lo enlazado', [p.lineas[17].decision, p.lineas[17].transaction_id], ['linked', 'tx-pya']);
  t.igual('la categoría a crear antes', p.categoriasNuevas, [{ ledger_id: 'personal', name: 'Cargos bancarios', type: 'expense' }]);
  t.igual('el pedido pasa los controles de la base', cuadraComoLaBase(p), null);
  t.igual('nada de lo que se dejó fuera de esta versión',
    p.lineas.filter(l => ['debt_id', 'subtract_from', 'grouped', 'card_id'].some(k => k in l)).length, 0);

  const pago1 = armarPedido(planearImportacion(extractoDe([MOVS[6]]), ctxDe({
    pagosDeTarjeta: [pago({ id: 'pago-x', centavos: 800000, date: '2026-09-06' })],
  }), OP));
  t.igual('un pago ya registrado: enlazado, no un pago nuevo', [pago1.lineas[0].decision, pago1.lineas[0].card_payment_id],
    ['linked', 'pago-x']);

  // Después de muchos cambios, sigue cuadrando como la base espera.
  let q = PLAN;
  q = aplicarCambio(q, 'depositos', { tipo: 'decidir', decision: 'income' });
  q = aplicarCambio(q, 'transferiste', { tipo: 'decidir', decision: 'expense' });
  q = aplicarCambio(q, 'te-transfirieron', { tipo: 'decidir', decision: 'skipped' });
  q = aplicarCambio(q, CLAVE[18], { tipo: 'es-otro' });
  q = aplicarCambio(q, CLAVE[16], { tipo: 'decidir', decision: 'income' });
  q = aplicarCambio(q, CLAVE[15], { tipo: 'enlazar', candidato: { tipo: 'movimiento', id: 'tx-raro' } });
  q = aplicarCambio(q, null, { tipo: 'retiros-como-gasto', valor: true });
  const vq = vistaDelPlan(q);
  t.igual('todo decidido: nada para revisar', [vq.resumen.paraRevisar, vq.pie.sinDecidir], [null, 0]);
  t.igual('el botón cuenta todo lo que hace algo', vq.boton.texto, 'Importar 14 movimientos');
  t.igual('…y el pedido sigue pasando los controles', cuadraComoLaBase(armarPedido(q)), null);
  t.igual('…con cada línea decidida', armarPedido(q).lineas.filter(l => l.decision === 'pending').length, 0);
}

// ─── Los textos ──────────────────────────────────────────────────────────────

t.igual('fecha corta', T.fechaCorta('2026-09-03'), '3 sep');
t.igual('con año', T.fechaCorta('2026-12-31', true), '31 dic 2026');
t.igual('de un timestamp', T.fechaCorta('2026-10-02T15:00:00Z'), '2 oct');
t.igual('la fila de otro año lleva el año', T.fechaDeFila('2025-12-30', HOY), '30 dic 2025');
t.igual('el período que cruza el año', T.periodo('2025-12-20', '2026-01-19'), '20 dic 2025 – 19 ene 2026');
t.igual('un solo movimiento', T.botonImportar(1), 'Importar 1 movimiento');
t.igual('uno para revisar', T.avisoParaRevisar(1), 'Para revisar: 1. Si no lo decidís, no se anota.');
t.igual('solo gastos', T.conteoSeAnotan(3, 0), 'Se anotan 3 gastos');
t.igual('un solo ingreso', T.conteoSeAnotan(0, 1), 'Se anota 1 ingreso');
t.igual('el resultado', T.textoListo(12, 1, 2, 5),
  'Listo: 12 anotados, 1 enlazado con lo que ya tenías, 2 pagos de tarjeta y 5 sin anotar.');

t.resumen();
