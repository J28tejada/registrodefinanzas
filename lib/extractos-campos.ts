/**
 * Lo que entra a la importación de un estado de cuenta, revisado antes de
 * mandarlo a la base.
 *
 * Lo corren los dos lados: la ruta de la web y el teléfono, que llama a
 * `importar_estado_de_cuenta` directo, sin ruta en el medio. La autoridad es
 * la función SQL —vuelve a cuadrar los saldos, el signo, las categorías y de
 * quién es cada cosa—, pero un pedido mal armado tiene que frenarse acá, con
 * un mensaje que diga qué línea está mal, y no como un código del servidor
 * después de un viaje de ida y vuelta.
 *
 * Además LIMPIA: de cada línea sale solo lo que su decisión usa. Un campo de
 * más que la función todavía lee (el `card_id` de una tarjeta de débito, que
 * por ahora no se elige) no llega nunca a la base aunque el cliente lo mande.
 *
 * La plata viaja en centavos enteros y así se controla: sin decimales, sin
 * `parseFloat`.
 */
import type {
  CabeceraDePedido,
  ClaseDeLinea,
  DecisionDePedido,
  LineaDePedido,
  PedidoDeImportacion,
} from './extractos/tipos';
import { ERRORES_DE_IMPORTACION } from './extractos/textos';
import type { LedgerColor, NuevaCard, TransactionType } from './types';
import { COLORES_DE_CUENTA } from './cuentas-campos';
import { leerCamposDeCiclo } from './tarjetas-campos';
import { diasEntre } from './tarjetas';

/** El mismo tope que la función SQL. Un estado mensual real anda por las 70. */
export const MAX_LINEAS_POR_PEDIDO = 1000;

/** Más que esto no es "las categorías que faltaban": es un pedido roto. */
const MAX_CATEGORIAS_NUEVAS = 20;

// Los largos que la base acepta o que la app ya usa: una categoría tiene el
// tope de `createCategory`, la descripción y la clave el de la función SQL.
const LARGO_CATEGORIA = 40;
const LARGO_DESCRIPCION = 120;
const LARGO_MATCH_KEY = 60;
const LARGO_NOMBRE_DE_CUENTA = 60;

const CLASES: ClaseDeLinea[] = [
  'purchase', 'fee', 'withdrawal', 'deposit', 'interest',
  'refund', 'transfer_out', 'transfer_in', 'own_transfer', 'other',
];

/*
 * Qué decisión admite cada signo. Es la misma regla que SIGNO_INVALIDO en la
 * función: un débito no puede ser un ingreso ni una devolución, y un crédito no
 * puede ser un gasto ni un pago de tarjeta. `linked` y `skipped` valen para
 * los dos, y `pending` también: es "todavía no se decidió".
 */
const PARA_DEBITO: DecisionDePedido[] = ['expense', 'card_payment', 'linked', 'skipped', 'pending'];
const PARA_CREDITO: DecisionDePedido[] = ['income', 'netted', 'linked', 'skipped', 'pending'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const BANCO = /^[a-z_]{2,20}$/;
const ULTIMOS4 = /^\d{4}$/;
// La forma de `statement_lines.line_key`, igual que el `check` de la tabla.
const CLAVE = /^\d{4}-\d{2}-\d{2}\|-?\d+\|-?\d+\|\d+$/;

const MAL_ARMADO = 'El pedido de importación vino mal armado. No se anotó nada.';

type Resultado<T> = { ok: true } & T | { ok: false; error: string };

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Un entero que JavaScript representa exacto: un saldo en centavos lo es siempre. */
const esEntero = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);

/**
 * ¿Es un día que existe? La forma sola deja pasar un 31 de junio, y Postgres
 * lo rechazaría con un error que no dice qué línea era.
 */
export function esFechaIso(v: unknown): v is string {
  if (typeof v !== 'string' || !ISO.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/**
 * Un texto opcional, recortado. `undefined` es "no vino"; `null` también, para
 * la subcategoría, que se manda en null cuando no hay.
 */
function textoOpcional(v: unknown, largo: number): { ok: true; s: string } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, s: '' };
  if (typeof v !== 'string') return { ok: false };
  const s = v.trim();
  return s.length > largo ? { ok: false } : { ok: true, s };
}

// ─── La consulta del contexto ────────────────────────────────────────────────

export interface ConsultaDeContexto {
  banco: string;
  ultimos4: string;
  /** Primera fecha de entrada del estado, ISO. */
  desde: string;
  /** Última fecha de entrada del estado, ISO. */
  hasta: string;
}

/**
 * Lo que pide `cargarContextoDeExtracto`. Lo valida la ruta de la web con los
 * parámetros de la URL, y la misma función por dentro, porque el teléfono la
 * llama sin ruta.
 */
export function leerConsultaDeContexto(
  b: Record<string, unknown>,
): Resultado<{ consulta: ConsultaDeContexto }> {
  if (typeof b.banco !== 'string' || !BANCO.test(b.banco)) {
    return { ok: false, error: 'Falta decir de qué banco es el estado de cuenta.' };
  }
  if (typeof b.ultimos4 !== 'string' || !ULTIMOS4.test(b.ultimos4)) {
    return { ok: false, error: 'Los últimos 4 de la cuenta tienen que ser cuatro números.' };
  }
  if (!esFechaIso(b.desde) || !esFechaIso(b.hasta) || b.desde > b.hasta) {
    return { ok: false, error: 'Las fechas del estado de cuenta son inválidas.' };
  }
  return { ok: true, consulta: { banco: b.banco, ultimos4: b.ultimos4, desde: b.desde, hasta: b.hasta } };
}

// ─── El pedido de importación ────────────────────────────────────────────────

export function leerPedidoDeImportacion(
  b: Record<string, unknown>,
): Resultado<{ pedido: PedidoDeImportacion }> {
  if (!esObjeto(b) || !esObjeto(b.cab) || !Array.isArray(b.lineas)) {
    return { ok: false, error: MAL_ARMADO };
  }

  const cab = leerCabecera(b.cab, b.cuentaNueva != null);
  if (!cab.ok) return cab;

  const crudas = b.lineas as unknown[];
  if (crudas.length === 0) {
    return { ok: false, error: 'El estado de cuenta no tiene movimientos para importar.' };
  }
  if (crudas.length > MAX_LINEAS_POR_PEDIDO) {
    return {
      ok: false,
      error: `Son demasiados movimientos para un estado de cuenta (el tope es ${MAX_LINEAS_POR_PEDIDO}).`,
    };
  }
  // Van TODAS las líneas, también las que no se deciden: si el número no da,
  // alguien recortó el lote, y la función no podría cuadrar los saldos.
  if (cab.cab.line_count !== crudas.length) {
    return { ok: false, error: ERRORES_DE_IMPORTACION.NO_CUADRA };
  }

  const lineas: LineaDePedido[] = [];
  let saldo = cab.cab.opening_cents;
  for (let i = 0; i < crudas.length; i++) {
    const leida = leerLinea(crudas[i], i + 1, cab.cab);
    if (!leida.ok) return leida;
    // La cadena de saldos, la misma cuenta que hace la función: saldo anterior
    // más cada línea tiene que dar el balance que imprimió el banco.
    saldo += leida.linea.cents;
    if (saldo !== leida.linea.balance) return { ok: false, error: ERRORES_DE_IMPORTACION.NO_CUADRA };
    lineas.push(leida.linea);
  }
  if (saldo !== cab.cab.closing_cents) return { ok: false, error: ERRORES_DE_IMPORTACION.NO_CUADRA };

  const enlaces = revisarEnlaces(lineas);
  if (!enlaces.ok) return enlaces;
  const netos = revisarNetos(lineas);
  if (!netos.ok) return netos;

  const pedido: PedidoDeImportacion = { cab: cab.cab, lineas };

  // `null` cuenta como "no vino": es lo que manda un cliente que arma el
  // objeto entero aunque no lo use.
  if (b.cuentaNueva != null) {
    if (b.completarLast4 != null) return { ok: false, error: MAL_ARMADO };
    const nueva = leerCuentaNueva(b.cuentaNueva, cab.cab.last4);
    if (!nueva.ok) return nueva;
    pedido.cuentaNueva = nueva.card;
  }

  if (b.completarLast4 != null) {
    const c = b.completarLast4;
    // Solo a la cuenta que se está usando y con los 4 de este estado: completar
    // otra cuenta, o con otros números, no tiene nada que ver con importar.
    if (!esObjeto(c) || !esUuid(c.card_id) || c.card_id !== cab.cab.account_card_id
        || c.last4 !== cab.cab.last4) {
      return { ok: false, error: ERRORES_DE_IMPORTACION.CUENTA_INVALIDA };
    }
    pedido.completarLast4 = { card_id: c.card_id, last4: cab.cab.last4 };
  }

  if (b.categoriasNuevas != null) {
    const cats = leerCategoriasNuevas(b.categoriasNuevas, cab.cab.ledger_id);
    if (!cats.ok) return cats;
    if (cats.categorias.length > 0) pedido.categoriasNuevas = cats.categorias;
  }

  return { ok: true, pedido };
}

function leerCabecera(c: Record<string, unknown>, conCuentaNueva: boolean): Resultado<{ cab: CabeceraDePedido }> {
  if (typeof c.bank !== 'string' || !BANCO.test(c.bank)) return { ok: false, error: MAL_ARMADO };
  if (typeof c.last4 !== 'string' || !ULTIMOS4.test(c.last4)) {
    return { ok: false, error: 'Los últimos 4 de la cuenta tienen que ser cuatro números.' };
  }
  if (!esUuid(c.ledger_id)) return { ok: false, error: 'Elegí en qué cuenta anotar.' };

  // La cuenta del banco: una que ya está en la Billetera, o ninguna todavía si
  // se va a crear. Las dos cosas a la vez no: no se sabría cuál usar.
  let cuenta: string | null;
  if (conCuentaNueva) {
    if (c.account_card_id !== null && c.account_card_id !== undefined) return { ok: false, error: MAL_ARMADO };
    cuenta = null;
  } else {
    if (!esUuid(c.account_card_id)) {
      return { ok: false, error: 'Elegí de qué cuenta de la Billetera es el estado de cuenta.' };
    }
    cuenta = c.account_card_id;
  }

  if (!esEntero(c.opening_cents) || !esEntero(c.closing_cents) || !esEntero(c.line_count)) {
    return { ok: false, error: MAL_ARMADO };
  }

  return {
    ok: true,
    cab: {
      bank: c.bank,
      last4: c.last4,
      account_card_id: cuenta,
      ledger_id: c.ledger_id,
      opening_cents: c.opening_cents,
      closing_cents: c.closing_cents,
      line_count: c.line_count,
    },
  };
}

function leerLinea(cruda: unknown, n: number, cab: CabeceraDePedido): Resultado<{ linea: LineaDePedido }> {
  if (!esObjeto(cruda)) return { ok: false, error: MAL_ARMADO };
  const l = cruda;

  if (!esFechaIso(l.posted) || !esFechaIso(l.date)) {
    return { ok: false, error: `La línea ${n} tiene una fecha inválida.` };
  }
  // La fecha de la compra no puede ser posterior a cuando el banco la asentó,
  // ni de más de un mes antes. La misma regla que FECHA_INVALIDA en la función.
  const atraso = diasEntre(l.date, l.posted);
  if (atraso < 0 || atraso > 31) return { ok: false, error: ERRORES_DE_IMPORTACION.FECHA_INVALIDA };

  if (!esEntero(l.cents) || l.cents === 0 || !esEntero(l.balance)) {
    return { ok: false, error: `La línea ${n} tiene un monto inválido.` };
  }
  if (!CLASES.includes(l.kind as ClaseDeLinea)) {
    return { ok: false, error: `La línea ${n} tiene un tipo de movimiento desconocido.` };
  }

  const decision = l.decision as DecisionDePedido;
  if (![...PARA_DEBITO, ...PARA_CREDITO].includes(decision)) {
    return { ok: false, error: ERRORES_DE_IMPORTACION.DECISION_INVALIDA };
  }
  if (!(l.cents < 0 ? PARA_DEBITO : PARA_CREDITO).includes(decision)) {
    return { ok: false, error: ERRORES_DE_IMPORTACION.SIGNO_INVALIDO };
  }

  const matchKey = l.match_key === undefined ? '' : l.match_key;
  if (typeof matchKey !== 'string' || matchKey.length > LARGO_MATCH_KEY) {
    return { ok: false, error: MAL_ARMADO };
  }

  const linea: LineaDePedido = {
    posted: l.posted,
    date: l.date,
    cents: l.cents,
    balance: l.balance,
    kind: l.kind as ClaseDeLinea,
    decision,
    match_key: matchKey,
  };

  switch (decision) {
    case 'expense':
    case 'income': {
      const categoria = textoOpcional(l.category, LARGO_CATEGORIA);
      if (!categoria.ok) return { ok: false, error: `La categoría de la línea ${n} es inválida.` };
      if (!categoria.s) return { ok: false, error: `La línea ${n} no tiene categoría.` };
      const sub = textoOpcional(l.subcategory, LARGO_CATEGORIA);
      if (!sub.ok) return { ok: false, error: `La línea ${n} tiene una subcategoría inválida.` };
      const descripcion = textoOpcional(l.description, LARGO_DESCRIPCION);
      if (!descripcion.ok) return { ok: false, error: `La descripción de la línea ${n} es demasiado larga.` };
      linea.category = categoria.s;
      linea.subcategory = sub.s || null;
      if (descripcion.s) linea.description = descripcion.s;

      if (l.net_cents !== undefined) {
        // El neto es lo que queda de una compra después de su devolución: solo
        // existe en un gasto, y tiene que quedar algo. Si se devolvió todo, la
        // compra y la devolución se omiten, no se guarda un gasto de cero.
        if (decision !== 'expense' || !esEntero(l.net_cents) || l.net_cents <= 0
            || l.net_cents >= Math.abs(l.cents)) {
          return { ok: false, error: ERRORES_DE_IMPORTACION.NETO_INVALIDO };
        }
        linea.net_cents = l.net_cents;
      }
      break;
    }
    case 'card_payment':
      if (!esUuid(l.credit_card_id)) {
        return { ok: false, error: `La línea ${n} no dice qué tarjeta se pagó.` };
      }
      // Pagarse a sí misma no significa nada; la función lo frena igual.
      if (l.credit_card_id === cab.account_card_id) {
        return { ok: false, error: ERRORES_DE_IMPORTACION.TARJETA_INVALIDA };
      }
      linea.credit_card_id = l.credit_card_id;
      break;
    case 'linked': {
      // Con UN movimiento o con UN pago de tarjeta, nunca con los dos: una
      // línea del banco es una sola cosa.
      const conMovimiento = l.transaction_id != null;
      const conPago = l.card_payment_id != null;
      if (conMovimiento === conPago) {
        return { ok: false, error: `La línea ${n} no dice con qué movimiento se enlaza.` };
      }
      if (conMovimiento) {
        if (!esUuid(l.transaction_id)) return { ok: false, error: MAL_ARMADO };
        linea.transaction_id = l.transaction_id;
      } else {
        if (!esUuid(l.card_payment_id)) return { ok: false, error: MAL_ARMADO };
        // Un pago de tarjeta es plata que sale: no explica un crédito.
        if (l.cents > 0) return { ok: false, error: ERRORES_DE_IMPORTACION.SIGNO_INVALIDO };
        linea.card_payment_id = l.card_payment_id;
      }
      break;
    }
    case 'netted':
      // Una devolución solo se descuenta de su compra en este MISMO estado.
      // Restarle a un gasto que ya estaba anotado no lo hace una importación.
      if (typeof l.nets_key !== 'string' || !CLAVE.test(l.nets_key)) {
        return { ok: false, error: ERRORES_DE_IMPORTACION.NETO_INVALIDO };
      }
      linea.nets_key = l.nets_key;
      break;
    case 'skipped':
    case 'pending':
      break;
  }

  return { ok: true, linea };
}

/**
 * Un movimiento ya anotado explica UNA línea. Si dos apuntan al mismo, un
 * gasto anotado una vez taparía dos compras reales. La función lo frena con
 * YA_ENLAZADO; acá se frena antes, con el mismo texto.
 */
function revisarEnlaces(lineas: LineaDePedido[]): Resultado<object> {
  const vistos = new Set<string>();
  for (const l of lineas) {
    if (l.decision !== 'linked') continue;
    const id = l.transaction_id ? `t:${l.transaction_id}` : `p:${l.card_payment_id}`;
    if (vistos.has(id)) return { ok: false, error: ERRORES_DE_IMPORTACION.YA_ENLAZADO };
    vistos.add(id);
  }
  return { ok: true };
}

/**
 * La clave de cada línea, con la misma fórmula que la función SQL y que
 * `LineaDeExtracto.clave`: fecha de entrada | centavos | saldo después | cuántas
 * iguales vinieron antes. Hace falta acá para saber a qué compra apunta cada
 * devolución.
 */
function clavesDelLote(lineas: LineaDePedido[]): string[] {
  const vistas = new Map<string, number>();
  return lineas.map(l => {
    const triple = `${l.posted}|${l.cents}|${l.balance}`;
    const n = vistas.get(triple) ?? 0;
    vistas.set(triple, n + 1);
    return `${triple}|${n}`;
  });
}

/**
 * Una compra guardada por su neto tiene que tener exactamente una devolución
 * de este lote que apunte a ella, y la resta tiene que dar exacta. Una
 * devolución, a su vez, tiene que apuntar a una compra que se guarda por su
 * neto. Si no, un error del cliente achicaría un gasto en silencio.
 */
function revisarNetos(lineas: LineaDePedido[]): Resultado<object> {
  const claves = clavesDelLote(lineas);
  const porClave = new Map(claves.map((k, i) => [k, lineas[i]]));

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (l.net_cents !== undefined) {
      const devoluciones = lineas.filter(d => d.decision === 'netted' && d.nets_key === claves[i]);
      if (devoluciones.length !== 1
          || Math.abs(l.cents) - devoluciones[0].cents !== l.net_cents) {
        return { ok: false, error: ERRORES_DE_IMPORTACION.NETO_INVALIDO };
      }
    }
    if (l.decision === 'netted') {
      const compra = porClave.get(l.nets_key ?? '');
      if (!compra || compra.decision !== 'expense' || compra.net_cents === undefined) {
        return { ok: false, error: ERRORES_DE_IMPORTACION.NETO_INVALIDO };
      }
    }
  }
  return { ok: true };
}

/**
 * La cuenta del banco que se crea en la Billetera. Tiene que ser de ahorro o
 * corriente y llevar los 4 de este estado: es lo que la función compara para
 * saber que la cuenta es esa.
 */
function leerCuentaNueva(v: unknown, last4: string): Resultado<{ card: NuevaCard }> {
  if (!esObjeto(v)) return { ok: false, error: MAL_ARMADO };

  const nombre = textoOpcional(v.name, LARGO_NOMBRE_DE_CUENTA);
  if (!nombre.ok || !nombre.s) return { ok: false, error: 'Ponele un nombre a la cuenta del banco.' };
  if (v.kind !== 'savings' && v.kind !== 'checking') {
    return { ok: false, error: 'La cuenta del banco tiene que ser de ahorro o corriente.' };
  }
  if (v.last4 !== last4) return { ok: false, error: ERRORES_DE_IMPORTACION.CUENTA_INVALIDA };

  const emisor = textoOpcional(v.issuer, LARGO_NOMBRE_DE_CUENTA);
  if (!emisor.ok) return { ok: false, error: MAL_ARMADO };

  let color: LedgerColor = 'blue';
  if (v.color !== undefined) {
    if (!COLORES_DE_CUENTA.includes(v.color as LedgerColor)) return { ok: false, error: 'Color inválido' };
    color = v.color as LedgerColor;
  }

  // El ciclo y el cupo son de las tarjetas de crédito, pero si vienen se
  // validan con las mismas reglas que el alta de siempre.
  const ciclo = leerCamposDeCiclo(v);
  if (!ciclo.ok) return ciclo;

  return {
    ok: true,
    card: { name: nombre.s, kind: v.kind, last4, issuer: emisor.s, color, ...ciclo.campos },
  };
}

function leerCategoriasNuevas(
  v: unknown, ledgerId: string,
): Resultado<{ categorias: { ledger_id: string; name: string; type: TransactionType }[] }> {
  if (!Array.isArray(v) || v.length > MAX_CATEGORIAS_NUEVAS) return { ok: false, error: MAL_ARMADO };

  const categorias: { ledger_id: string; name: string; type: TransactionType }[] = [];
  for (const c of v as unknown[]) {
    if (!esObjeto(c)) return { ok: false, error: MAL_ARMADO };
    // En la cuenta donde se anota: la función busca la categoría ahí y en
    // ningún otro lado, así que crearla en otra no serviría de nada.
    if (c.ledger_id !== ledgerId) return { ok: false, error: MAL_ARMADO };
    const nombre = textoOpcional(c.name, LARGO_CATEGORIA);
    if (!nombre.ok || !nombre.s) return { ok: false, error: 'Hay una categoría nueva sin nombre.' };
    if (c.type !== 'income' && c.type !== 'expense') return { ok: false, error: MAL_ARMADO };
    categorias.push({ ledger_id: ledgerId, name: nombre.s, type: c.type });
  }
  return { ok: true, categorias };
}
