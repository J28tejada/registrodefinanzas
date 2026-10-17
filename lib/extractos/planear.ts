/**
 * El plan de una importación: qué se hace con cada línea del estado de cuenta,
 * y todo lo que la pantalla de revisión muestra.
 *
 * Es la pieza entre la lectura (`ExtractoLeido`) y el pedido a la base
 * (`PedidoDeImportacion`). Vive acá, pura y compartida, para que la web y el
 * teléfono muestren los mismos números y las mismas palabras POR
 * CONSTRUCCIÓN: las dos pantallas solo dibujan lo que devuelve `vistaDelPlan`
 * y mandan lo que devuelve `armarPedido`.
 *
 * Lo que se exporta, en el orden en que se usa:
 *
 *   libroSugerido(extracto, ctx, cuentaPedida?)   el libro que se ofrece en "Anotar en"
 *   planearImportacion(extracto, ctx, op)          el plan con todo por defecto
 *   aplicarCambio(plan, destino, cambio)           lo que la persona toca
 *   vistaDelPlan(plan)                             resumen, secciones, botón
 *   hojaDeLinea(plan, clave)                       la hoja de una línea
 *   candidatosParaEnlazar(plan, clave)             lo que ofrece "Ya está anotado"
 *   armarPedido(plan)                              lo que se manda a importar
 *
 * Los textos salen de `textos-plan.ts`. La plata va siempre en centavos y con
 * su rol (ingreso, gasto, apagado): la formatea cada app con su formateador.
 *
 * Las reglas de fondo:
 * - En `transactions` solo entra plata que entró o salió del patrimonio. Un
 *   retiro, una transferencia entre cuentas propias o un pago de tarjeta no son
 *   gastos: anotarlos contaría dos veces.
 * - Lo ambiguo no se adivina: queda "Para revisar" y, si no se decide, NO se
 *   importa ni se recuerda. Se decide subiendo el mismo PDF otra vez.
 * - Lo que elige la persona se guarda aparte de lo sugerido (`elecciones`) y
 *   lo sugerido se vuelve a calcular entero después de cada cambio. Así cambiar
 *   de libro o de cuenta no pierde nada de lo elegido, y el resultado no
 *   depende del orden en que se tocaron las cosas.
 */
import type { Category, TransactionType } from '../types';
import type {
  Aprendido, ClaseDeLinea, ContextoDeExtracto, DecisionDePedido, ExtractoLeido, LineaDeExtracto,
  LineaDePedido, LineaPrevia, PedidoDeImportacion,
} from './tipos';
import { FALTA_MIGRACION } from './textos';
import * as T from './textos-plan';
import {
  Candidato, Cotejo, EstadoDeLinea, RefDeCandidato, centavosDeCandidato, cotejar, estadoDeLinea,
  fechaDeCandidato, idDeCandidato, idsUsados, llaveDeCandidato, normalizarTexto, previasDeLaCuenta,
  refDeCandidato,
} from './cotejar';
import {
  CARGOS_BANCARIOS, OrigenDeCategoria, categoriaPara, hayCategoriaDeCargos, resolverCategoria,
} from './categorizar';
import { CuentaElegida, cardDeLaCuenta, cuentasElegibles, elegirCuenta, nombreDeProducto } from './cuenta';
import { diasEntre, sumarDias } from '../tarjetas';

/**
 * Los retiros de efectivo NO se anotan por defecto: lo que se compra con esa
 * plata se anota cuando se gasta, y anotar también el retiro lo contaría dos
 * veces. Es una decisión del dueño (J2); cada importación igual tiene el
 * interruptor "Anotar los retiros como gasto".
 */
export const RETIROS_COMO_GASTO_POR_DEFECTO = false;

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Lo que se hace con una línea. Es lo mismo que entiende la función SQL. */
export type Decision = DecisionDePedido;

/** Lo que la persona puede elegir para una línea (todo menos 'pending'). */
export type DecisionElegible = Exclude<Decision, 'pending'>;

/** Los grupos de "Para revisar", cada uno con su pregunta. */
export type GrupoDeRevision =
  | 'depositos'
  | 'te-transfirieron'
  | 'transferiste'
  | 'ya-anotado'
  | 'devoluciones'
  | 'otros'
  | 'sin-categoria'
  | 'borrados';

/** En este orden se muestran dentro de "Para revisar". */
export const ORDEN_DE_GRUPOS: GrupoDeRevision[] = [
  'depositos', 'te-transfirieron', 'transferiste', 'ya-anotado', 'devoluciones', 'otros', 'sin-categoria', 'borrados',
];

/**
 * Por qué una línea quedó como quedó. Cada uno tiene su texto en
 * `textos-plan.ts`; la vista ya los trae resueltos.
 */
export type MotivoDeLinea =
  // Lo que viene de importaciones anteriores.
  | 'ya-importada' | 'sin-anotar-antes' | 'borrada'
  // No se anota.
  | 'retiro' | 'entre-cuentas' | 'devuelta' | 'sigue-a-su-compra' | 'descontada' | 'elegida' | 'aprendida'
  // Falta decidir.
  | 'deposito' | 'transferencia-recibida' | 'transferencia-enviada' | 'posible' | 'devolucion' | 'otro'
  | 'sin-categoria' | 'categoria-inexistente' | 'falta-tarjeta'
  // Hace algo que no es un gasto ni un ingreso.
  | 'pago-de-tarjeta' | 'ya-estaba';

/**
 * Lo que la persona eligió para una línea. Pisa lo sugerido y sobrevive a
 * cambiar de libro o de cuenta. Cada campo es independiente: elegir la
 * categoría no decide la línea, y "Es otro" no borra la descripción escrita.
 */
export interface EleccionDeLinea {
  decision?: DecisionElegible;
  /** Con `decision: 'linked'`: el movimiento o el pago que ya estaba. */
  enlace?: RefDeCandidato;
  /** Con `decision: 'card_payment'`: la tarjeta de crédito que se pagó. */
  tarjetaId?: string;
  /** Elegida a mano. Si no existe en el libro destino, la línea vuelve a "Para revisar". */
  categoria?: { categoria: string; subcategoria: string | null };
  descripcion?: string;
  /** "Es otro": el candidato que se le ofrecía no es esta línea. */
  esOtro?: boolean;
}

/** Una línea del estado con todo lo que se decidió sobre ella. Se arma sola: no se edita. */
export interface LineaDelPlan {
  /** La clave de la línea (`asentada|centavos|saldo|n`), única en el estado. */
  clave: string;
  /** Su posición en el estado, desde 0. */
  indice: number;
  /** La línea tal como llegó de la lectura. */
  linea: LineaDeExtracto;
  /** Frente a importaciones anteriores de esta misma cuenta. */
  estado: EstadoDeLinea;
  /** Lo que guardó la importación anterior, si hubo. */
  previa: LineaPrevia | null;
  /** Lo que encontró `cotejar` (fijo mientras no cambie la cuenta). */
  cotejo: Cotejo;
  /** Ya importada y cerrada: no se toca ni se manda. Va a "Ya importados antes". */
  bloqueada: boolean;
  /**
   * Lo que se haría con la línea, esté completa o no. Un gasto todavía sin
   * categoría es `intencion: 'expense'` con `lista: false`.
   */
  intencion: Decision;
  /** Tiene todo lo que necesita para importarse. */
  lista: boolean;
  /** Lo que se manda: `intencion` si está lista, si no 'pending'. Siempre 'pending' si está bloqueada. */
  decision: Decision;
  /** La intención la eligió la persona (y no la sugerencia). */
  porUsuario: boolean;
  /** Para un gasto o ingreso: la categoría, tal como está guardada en el libro destino. */
  categoria: string | null;
  subcategoria: string | null;
  /** De dónde salió la categoría. 'elegida' = a mano. */
  origenCategoria: OrigenDeCategoria | 'elegida' | null;
  /** La categoría todavía no existe: se crea al importar ('Cargos bancarios'). */
  categoriaNueva: boolean;
  /** La que eligió la persona y no existe en el libro destino (para decirle cuál). */
  categoriaFaltante: string | null;
  /** La descripción que se guardaría: la del banco, la escrita, o "{Comercio} (con devolución)". */
  descripcion: string;
  /** Con `intencion: 'linked'`: con qué está enlazada. */
  enlace: Candidato | null;
  /** Con `intencion: 'card_payment'`: la tarjeta de crédito que se paga. */
  tarjetaId: string | null;
  /** Una compra que se guarda por lo que quedó después de su devolución, en centavos. */
  netoCentavos: number | null;
  /** En esa compra: la clave de la devolución que se le descuenta. */
  devolucion: string | null;
  /** En una devolución descontada: la clave de su compra. */
  descuentaDe: string | null;
  /** Los candidatos libres por los que se pregunta "¿Ya lo anotaste?". */
  posibles: Candidato[];
  motivo: MotivoDeLinea | null;
}

export interface OpcionesDePlan {
  /** El libro (la "cuenta" de la app: Personal, Hogar…) donde se anota. */
  ledgerId: string;
  /** Su nombre, para los avisos. Sin él se dice "esta cuenta". */
  ledgerName?: string | null;
  /** Las categorías. Se usan solo las de `ledgerId`: pasar todas está bien. */
  categorias: Category[];
  /** La cuenta del banco desde la que se abrió la importación (?card=). */
  cuentaPedida?: string | null;
  /** Hoy (YYYY-MM-DD) en la zona de la persona: las fechas de este año van sin año. */
  hoy: string;
}

/** El plan entero. Se crea con `planearImportacion` y se cambia solo con `aplicarCambio`. */
export interface Plan {
  extracto: ExtractoLeido;
  ctx: ContextoDeExtracto;
  ledgerId: string;
  ledgerName: string | null;
  /** Las categorías del libro destino, y solo esas. */
  categorias: Category[];
  hoy: string;
  cuentaPedida: string | null;
  /** Qué cuenta de la Billetera es la del estado. */
  cuenta: CuentaElegida;
  /** El interruptor "Anotar los retiros como gasto". */
  retirosComoGasto: boolean;
  /** El interruptor "Crear «Cargos bancarios»". Arranca prendido; solo pesa si el libro no tiene dónde ponerlos. */
  crearCargosBancarios: boolean;
  /** Si hay cargos del banco que irían a 'Cargos bancarios' si se crea: decide si se muestra el interruptor. */
  necesitaCargosBancarios: boolean;
  /** Lo que eligió la persona, por clave de línea. */
  elecciones: Record<string, EleccionDeLinea>;
  /**
   * Las líneas que alguna vez quedaron sin decidir, con el grupo donde
   * entraron. No salen de "Para revisar" al decidirse: la lista no salta.
   */
  enRevision: Record<string, GrupoDeRevision>;
  /** Una por línea del estado, en el mismo orden. */
  lineas: LineaDelPlan[];
}

/**
 * Lo que la persona puede tocar. Se aplica con `aplicarCambio(plan, destino, cambio)`.
 *
 * Sobre una línea (`destino` = su clave):
 * - `decidir`: Gasto, Ingreso o No anotar.
 * - `anotar-de-nuevo`: una línea cuyo movimiento se borró, como estaba antes.
 * - `enlazar`: "Es el mismo" / "Ya está anotado" con un candidato.
 * - `es-otro`: el candidato no es esta línea; vuelve a lo que le toca sin él.
 * - `pagar-tarjeta`: es un pago a esa tarjeta de crédito.
 * - `descontar`: una devolución se descuenta de su compra en este mismo estado.
 * - `categoria`: con `extender`, también a las otras del mismo comercio sin categoría elegida.
 * - `descripcion`: vacía vuelve a la del banco.
 *
 * Sobre un grupo de "Para revisar" (`destino` = el grupo): `decidir` y
 * `anotar-de-nuevo` tocan solo las líneas del grupo que siguen sin decidir.
 *
 * Sobre el plan entero (`destino` = null): los dos interruptores, el libro y la cuenta.
 */
export type CambioDePlan =
  | { tipo: 'decidir'; decision: 'expense' | 'income' | 'skipped' }
  | { tipo: 'anotar-de-nuevo' }
  | { tipo: 'enlazar'; candidato: RefDeCandidato }
  | { tipo: 'es-otro' }
  | { tipo: 'pagar-tarjeta'; tarjetaId: string }
  | { tipo: 'descontar' }
  | { tipo: 'categoria'; categoria: string; subcategoria: string | null; extender?: boolean }
  | { tipo: 'descripcion'; descripcion: string }
  | { tipo: 'retiros-como-gasto'; valor: boolean }
  | { tipo: 'crear-cargos-bancarios'; valor: boolean }
  | { tipo: 'libro'; ledgerId: string; categorias: Category[]; ledgerName?: string | null }
  | { tipo: 'cuenta'; cardId: string | null };

// ─── Ayudas chicas ───────────────────────────────────────────────────────────

const APRENDEN: ClaseDeLinea[] = ['deposit', 'transfer_in', 'transfer_out'];
const PUEDEN_SER_PAGO: ClaseDeLinea[] = ['transfer_out', 'own_transfer'];
const MAX_DESCRIPCION = 120;

function porTexto(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function esDebito(l: LineaDelPlan | LineaDeExtracto): boolean {
  return ('linea' in l ? l.linea.centavos : l.centavos) < 0;
}

/** Lo que admite cada signo. La función SQL lo vuelve a controlar (SIGNO_INVALIDO). */
function decisionValida(d: DecisionElegible, debito: boolean): boolean {
  if (d === 'expense' || d === 'card_payment') return debito;
  if (d === 'income' || d === 'netted') return !debito;
  return true;
}

/** Las tarjetas de crédito a las que se puede pagar: nunca la cuenta misma. */
function tarjetasDeCredito(plan: Plan) {
  const cuentaId = cardDeLaCuenta(plan.cuenta)?.id ?? null;
  return plan.ctx.cards
    .filter(c => c.kind === 'credit' && c.id !== cuentaId)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || porTexto(a.name, b.name) || porTexto(a.id, b.id));
}

/** La tarjeta de crédito propia con esos últimos 4, si hay. */
function tarjetaPorUltimos4(plan: Plan, ultimos4: string | null): string | null {
  if (!ultimos4) return null;
  return tarjetasDeCredito(plan).find(c => c.last4 === ultimos4)?.id ?? null;
}

/** Si esos últimos 4 son de una cuenta de banco propia. */
function esCuentaPropia(plan: Plan, ultimos4: string | null): boolean {
  if (!ultimos4) return false;
  return plan.ctx.cards.some(c => (c.kind === 'savings' || c.kind === 'checking') && c.last4 === ultimos4);
}

function buscarCandidato(plan: Plan, ref: RefDeCandidato): Candidato | null {
  if (ref.tipo === 'movimiento') {
    const t = plan.ctx.movimientos.find(m => m.id === ref.id);
    return t ? { tipo: 'movimiento', movimiento: t, motivo: 'manual' } : null;
  }
  const p = plan.ctx.pagosDeTarjeta.find(m => m.id === ref.id);
  return p ? { tipo: 'pago', pago: p, motivo: 'manual' } : null;
}

/** Un débito solo se enlaza con un gasto o un pago; un crédito, con un ingreso. */
function candidatoCompatible(l: LineaDeExtracto, c: Candidato): boolean {
  if (c.tipo === 'pago') return l.centavos < 0;
  return (l.centavos < 0) === (c.movimiento.type === 'expense');
}

function nombreDeTarjeta(plan: Plan, id: string | null): string {
  const c = plan.ctx.cards.find(x => x.id === id);
  return c ? T.nombreConUltimos4(c.name, c.last4) : 'la tarjeta';
}

/**
 * Si a esta devolución se le puede ofrecer "Descontar de la compra": su compra
 * está en el estado, se anota como gasto y es mayor (un neto de cero o
 * negativo no es un gasto; la base lo rechaza con NETO_INVALIDO).
 */
function puedeDescontarse(plan: Plan, r: LineaDelPlan): boolean {
  if (r.linea.clase !== 'refund' || r.linea.centavos <= 0 || !r.linea.devolucionDe) return false;
  const p = plan.lineas.find(x => x.clave === r.linea.devolucionDe);
  if (!p || p.bloqueada || p.intencion !== 'expense' || !p.lista || -p.linea.centavos <= r.linea.centavos) return false;
  // Solo la primera devolución de cada compra: la base acepta una por compra.
  const primera = plan.lineas.find(x =>
    x.linea.clase === 'refund' && x.linea.centavos > 0 && x.linea.devolucionDe === p.clave);
  return primera?.clave === r.clave;
}

/** "{Comercio} (con devolución)", dentro del largo que acepta la base. */
function conDevolucion(l: LineaDeExtracto): string {
  const base = l.comercio || l.descripcion;
  const sufijo = ' (con devolución)';
  return base.slice(0, MAX_DESCRIPCION - sufijo.length) + sufijo;
}

// ─── El plan por defecto ─────────────────────────────────────────────────────

/** Lo fijo de cada línea: su estado frente a lo importado y lo que encontró `cotejar`. */
function lineasFijas(extracto: ExtractoLeido, ctx: ContextoDeExtracto, cuenta: CuentaElegida): LineaDelPlan[] {
  const previas = previasDeLaCuenta(ctx.lineasPrevias, extracto.banco, extracto.ultimos4);
  const cotejos = cotejar(extracto.lineas, ctx, {
    banco: extracto.banco,
    ultimos4: extracto.ultimos4,
    cuentaId: cardDeLaCuenta(cuenta)?.id ?? null,
  });
  return extracto.lineas.map((linea, indice) => {
    const previa = previas.get(linea.clave) ?? null;
    const estado = estadoDeLinea(previa);
    return {
      clave: linea.clave,
      indice,
      linea,
      estado,
      previa,
      cotejo: cotejos.get(linea.clave) ?? { tipo: 'ninguno' },
      bloqueada: estado === 'importada',
      intencion: 'pending',
      lista: false,
      decision: 'pending',
      porUsuario: false,
      categoria: null,
      subcategoria: null,
      origenCategoria: null,
      categoriaNueva: false,
      categoriaFaltante: null,
      descripcion: linea.descripcion,
      enlace: null,
      tarjetaId: null,
      netoCentavos: null,
      devolucion: null,
      descuentaDe: null,
      posibles: [],
      motivo: null,
    };
  });
}

/**
 * El libro que se ofrece en "Anotar en": el del movimiento más reciente pagado
 * con esta cuenta. Null si no hay ninguno: la pantalla usa el libro actual.
 */
export function libroSugerido(
  extracto: ExtractoLeido, ctx: ContextoDeExtracto, cuentaPedida?: string | null,
): string | null {
  const card = cardDeLaCuenta(elegirCuenta(ctx.cards, extracto, cuentaPedida));
  if (!card) return null;
  const deLaCuenta = ctx.movimientos
    .filter(t => t.card_id === card.id && t.ledger_id)
    .sort((a, b) => porTexto(b.date, a.date) || porTexto(a.id, b.id));
  return deLaCuenta[0]?.ledger_id ?? null;
}

/** El plan con todo lo sugerido. Nada elegido todavía. */
export function planearImportacion(
  extracto: ExtractoLeido, ctx: ContextoDeExtracto, op: OpcionesDePlan,
): Plan {
  const cuenta = elegirCuenta(ctx.cards, extracto, op.cuentaPedida);
  return derivar({
    extracto,
    ctx,
    ledgerId: op.ledgerId,
    ledgerName: op.ledgerName ?? null,
    categorias: op.categorias.filter(c => c.ledger_id === op.ledgerId),
    hoy: op.hoy,
    cuentaPedida: op.cuentaPedida ?? null,
    cuenta,
    retirosComoGasto: RETIROS_COMO_GASTO_POR_DEFECTO,
    crearCargosBancarios: true,
    necesitaCargosBancarios: false,
    elecciones: {},
    enRevision: {},
    lineas: lineasFijas(extracto, ctx, cuenta),
  });
}

/**
 * Lo aprendido para una transferencia o un depósito: lo último que se hizo con
 * ese mismo `matchKey` en una importación anterior, si vale para este signo.
 */
function decisionAprendida(
  plan: Plan, l: LineaDeExtracto,
): { intencion: Decision; motivo: MotivoDeLinea | null; tarjetaId?: string } | null {
  if (!l.matchKey) return null;
  const a = plan.ctx.aprendido
    .filter(x => x.match_key === l.matchKey)
    .sort((x, y) => porTexto(y.created_at, x.created_at))[0];
  if (!a) return null;
  const debito = l.centavos < 0;
  switch (a.decision) {
    case 'skipped':
      return { intencion: 'skipped', motivo: 'aprendida' };
    case 'expense':
      return debito ? { intencion: 'expense', motivo: null } : null;
    case 'income':
      return debito ? null : { intencion: 'income', motivo: null };
    case 'linked':
    case 'netted':
      // Se enlazó con algo que la persona había anotado: ese tipo es lo que enseña.
      if (a.type === 'expense' && debito) return { intencion: 'expense', motivo: null };
      if (a.type === 'income' && !debito) return { intencion: 'income', motivo: null };
      return null;
    case 'card_payment': {
      const tarjetaId = debito ? tarjetaPorUltimos4(plan, l.ultimos4Contraparte) : null;
      return tarjetaId ? { intencion: 'card_payment', motivo: 'pago-de-tarjeta', tarjetaId } : null;
    }
  }
  return null;
}

/** El grupo de "Para revisar" en el que entra una línea la primera vez que queda sin decidir. */
function grupoPara(l: LineaDelPlan): GrupoDeRevision {
  if (l.motivo === 'borrada') return 'borrados';
  if (l.motivo === 'posible') return 'ya-anotado';
  if (l.motivo === 'sin-categoria' || l.motivo === 'categoria-inexistente') return 'sin-categoria';
  switch (l.linea.clase) {
    case 'deposit': return 'depositos';
    case 'transfer_in': return 'te-transfirieron';
    case 'transfer_out': return 'transferiste';
    case 'refund': return 'devoluciones';
    default: return 'otros';
  }
}

/**
 * Vuelve a calcular todo lo sugerido a partir de lo fijo, lo elegido y los
 * interruptores. Es la única función que llena los campos de `LineaDelPlan`.
 */
function derivar(entrada: Plan): Plan {
  const plan: Plan = { ...entrada };
  const { ctx } = plan;
  const usados = idsUsados(ctx.lineasPrevias);
  const lineas = plan.lineas.map((l): LineaDelPlan => ({
    ...l,
    intencion: 'pending',
    lista: false,
    decision: 'pending',
    porUsuario: false,
    categoria: null,
    subcategoria: null,
    origenCategoria: null,
    categoriaNueva: false,
    categoriaFaltante: null,
    descripcion: l.linea.descripcion,
    enlace: null,
    tarjetaId: null,
    netoCentavos: null,
    devolucion: null,
    descuentaDe: null,
    posibles: [],
    motivo: null,
  }));
  plan.lineas = lineas;
  const porClave = new Map(lineas.map(l => [l.clave, l] as [string, LineaDelPlan]));
  const eleccion = (l: LineaDelPlan): EleccionDeLinea => plan.elecciones[l.clave] ?? {};

  // ── 1) Los enlaces. Primero los que eligió la persona, después los exactos.
  //       Un movimiento explica UNA línea (YA_ENLAZADO en la base).
  const tomados = new Map<string, string>();
  for (const l of lineas) {
    const e = eleccion(l);
    if (l.bloqueada || e.decision !== 'linked' || !e.enlace) continue;
    const c = buscarCandidato(plan, e.enlace);
    const llave = llaveDeCandidato(e.enlace);
    if (!c || usados.has(e.enlace.id) || tomados.has(llave) || !candidatoCompatible(l.linea, c)) continue;
    tomados.set(llave, l.clave);
    l.enlace = c;
  }
  for (const l of lineas) {
    const e = eleccion(l);
    // Lo que dice la importación anterior (sin anotar, borrada) va antes que
    // un enlace: a esas el exacto se les ofrece, no se les asigna.
    if (l.bloqueada || l.estado !== 'nueva' || l.cotejo.tipo !== 'exacto' || e.decision || e.esOtro) continue;
    const llave = llaveDeCandidato(l.cotejo.candidato);
    // Si la persona se lo dio a otra línea, esta queda como si no lo hubiera tenido.
    if (tomados.has(llave)) continue;
    tomados.set(llave, l.clave);
    l.enlace = l.cotejo.candidato;
  }
  for (const l of lineas) {
    if (l.bloqueada || eleccion(l).esOtro) continue;
    const ofrecidos = l.cotejo.tipo === 'posible' ? l.cotejo.candidatos
      : l.cotejo.tipo === 'exacto' && l.estado !== 'nueva' ? [l.cotejo.candidato]
        : [];
    l.posibles = ofrecidos.filter(c => {
      const de = tomados.get(llaveDeCandidato(c));
      return de === undefined || de === l.clave;
    });
  }

  // ── Las devoluciones con su compra en este mismo estado. Solo la primera
  //    devolución de cada compra se le puede descontar: la base acepta una.
  const compraDe = new Map<string, LineaDelPlan>();
  const devolucionDe = new Map<string, LineaDelPlan>();
  for (const r of lineas) {
    const de = r.linea.devolucionDe;
    if (r.linea.clase !== 'refund' || r.linea.centavos <= 0 || !de) continue;
    const p = porClave.get(de);
    if (!p || p.linea.centavos >= 0 || devolucionDe.has(p.clave)) continue;
    compraDe.set(r.clave, p);
    devolucionDe.set(p.clave, r);
  }

  // ── 2) La intención de cada línea.
  for (const l of lineas) {
    const r = intencionDe(plan, l, eleccion(l), devolucionDe.get(l.clave), eleccion);
    l.intencion = r.intencion;
    l.motivo = r.motivo;
    l.porUsuario = r.porUsuario;
    l.tarjetaId = r.tarjetaId ?? null;
  }

  // ── 3) Las categorías. Lo enlazado en este mismo estado enseña al resto:
  //       un PedidosYa que ya estaba en Alimentación lleva ahí a los otros.
  const historial: Aprendido[] = ctx.aprendido.slice();
  for (const l of lineas) {
    if (l.intencion !== 'linked' || l.enlace?.tipo !== 'movimiento' || !l.linea.matchKey) continue;
    const m = l.enlace.movimiento;
    historial.push({
      match_key: l.linea.matchKey, decision: 'linked', type: m.type, category: m.category,
      subcategory: m.subcategory, ledger_id: m.ledger_id, created_at: '9999-12-31T23:59:59Z',
    });
  }
  const hayCargos = hayCategoriaDeCargos(plan.categorias);
  const crear = plan.crearCargosBancarios && !hayCargos;
  plan.necesitaCargosBancarios = false;
  for (const l of lineas) {
    if (l.bloqueada || (l.intencion !== 'expense' && l.intencion !== 'income')) continue;
    const tipo: TransactionType = l.intencion;
    const elegida = eleccion(l).categoria;
    if (elegida) {
      const r = resolverElegida(plan, tipo, elegida.categoria, elegida.subcategoria);
      if (r) {
        l.categoria = r.categoria;
        l.subcategoria = r.subcategoria;
        l.categoriaNueva = r.nueva;
        l.origenCategoria = 'elegida';
      } else {
        l.categoriaFaltante = elegida.categoria;
        l.motivo = 'categoria-inexistente';
      }
      continue;
    }
    const s = categoriaPara(l.linea, tipo, plan.categorias, historial, ctx.movimientos, {
      yo: ctx.yo, crearCargosBancarios: crear,
    });
    if (!hayCargos && l.linea.clase === 'fee' && tipo === 'expense') {
      // ¿Iría a 'Cargos bancarios' si se crea? Eso decide si se muestra el interruptor.
      const conCargos = crear ? s : categoriaPara(l.linea, tipo, plan.categorias, historial, ctx.movimientos, {
        yo: ctx.yo, crearCargosBancarios: true,
      });
      if (conCargos?.nueva) plan.necesitaCargosBancarios = true;
    }
    if (s) {
      l.categoria = s.categoria;
      l.subcategoria = s.subcategoria;
      l.categoriaNueva = s.nueva === true;
      l.origenCategoria = s.origen;
    } else {
      l.motivo = 'sin-categoria';
    }
  }

  // ── 4) Las devoluciones siguen a su compra.
  for (const r of lineas) {
    if (r.bloqueada || r.linea.clase !== 'refund') continue;
    const p = compraDe.get(r.clave);
    const puedeDescontar = !!p && !p.bloqueada && p.intencion === 'expense' && p.categoria !== null &&
      -p.linea.centavos > r.linea.centavos;
    if (r.intencion === 'netted') {
      if (puedeDescontar && p) {
        r.descuentaDe = p.clave;
        r.motivo = 'descontada';
      } else {
        r.motivo = 'devolucion';
      }
      continue;
    }
    // Solo la que quedó en lo que le toca por defecto; lo elegido y lo enlazado se respetan.
    if (r.porUsuario || r.motivo !== 'devolucion' || !p) continue;
    if (puedeDescontar) {
      r.intencion = 'netted';
      r.descuentaDe = p.clave;
      r.motivo = 'descontada';
    } else if (!p.bloqueada && p.intencion === 'skipped') {
      r.intencion = 'skipped';
      r.motivo = p.motivo === 'devuelta' ? 'devuelta' : 'sigue-a-su-compra';
    }
  }

  // ── 5) Netos y descripciones.
  for (const r of lineas) {
    if (r.intencion !== 'netted' || !r.descuentaDe) continue;
    const p = porClave.get(r.descuentaDe);
    if (!p) continue;
    p.netoCentavos = -p.linea.centavos - r.linea.centavos;
    p.devolucion = r.clave;
  }
  for (const l of lineas) {
    const escrita = eleccion(l).descripcion;
    l.descripcion = escrita ?? (l.netoCentavos !== null ? conDevolucion(l.linea) : l.linea.descripcion);
  }

  // ── 6) Lista o no, y lo que se manda.
  for (const l of lineas) {
    if (l.bloqueada) {
      l.lista = false;
      l.decision = 'pending';
      continue;
    }
    switch (l.intencion) {
      case 'expense':
      case 'income':
        l.lista = l.categoria !== null;
        break;
      case 'linked':
        l.lista = l.enlace !== null;
        if (!l.lista) l.motivo = 'posible';
        break;
      case 'card_payment':
        l.lista = l.tarjetaId !== null;
        break;
      case 'netted':
        l.lista = l.descuentaDe !== null;
        break;
      case 'skipped':
        l.lista = true;
        break;
      default:
        l.lista = false;
    }
    l.decision = l.lista ? l.intencion : 'pending';
  }

  // ── 7) Lo que quedó sin decidir entra a "Para revisar" y ya no sale.
  const enRevision = { ...plan.enRevision };
  for (const l of lineas) {
    if (!l.bloqueada && !l.lista && !(l.clave in enRevision)) enRevision[l.clave] = grupoPara(l);
  }
  plan.enRevision = enRevision;
  return plan;
}

/** Una categoría elegida a mano, en el libro destino; o la de cargos que se va a crear. */
function resolverElegida(
  plan: Plan, tipo: TransactionType, nombre: string, sub: string | null,
): { categoria: string; subcategoria: string | null; nueva: boolean } | null {
  const r = resolverCategoria(plan.categorias, tipo, nombre, sub);
  if (r) return { ...r, nueva: false };
  const esCargos = normalizarTexto(nombre) === normalizarTexto(CARGOS_BANCARIOS);
  if (esCargos && tipo === 'expense' && plan.crearCargosBancarios && !hayCategoriaDeCargos(plan.categorias)) {
    return { categoria: CARGOS_BANCARIOS, subcategoria: null, nueva: true };
  }
  return null;
}

/**
 * Lo que le toca a una línea, en este orden:
 * 1. lo que eligió la persona;
 * 2. lo que dice la importación anterior (sin anotar antes, borrada);
 * 3. un enlace exacto con algo ya anotado;
 * 4. lo que se sabe por los últimos 4 (pago de tarjeta, entre cuentas) y los retiros;
 * 5. un candidato parecido: se pregunta, no se asigna;
 * 6. lo aprendido de ese mismo comercio o contraparte (transferencias y depósitos);
 * 7. lo que corresponde a su clase.
 */
function intencionDe(
  plan: Plan,
  l: LineaDelPlan,
  e: EleccionDeLinea,
  devolucion: LineaDelPlan | undefined,
  eleccionDe: (l: LineaDelPlan) => EleccionDeLinea,
): { intencion: Decision; motivo: MotivoDeLinea | null; porUsuario: boolean; tarjetaId?: string } {
  const ln = l.linea;
  const debito = ln.centavos < 0;
  if (l.bloqueada) return { intencion: 'pending', motivo: 'ya-importada', porUsuario: false };

  if (e.decision && decisionValida(e.decision, debito)) {
    switch (e.decision) {
      case 'skipped':
        return { intencion: 'skipped', motivo: 'elegida', porUsuario: true };
      case 'linked':
        return { intencion: 'linked', motivo: 'ya-estaba', porUsuario: true };
      case 'card_payment': {
        const ok = !!e.tarjetaId && tarjetasDeCredito(plan).some(c => c.id === e.tarjetaId);
        return ok
          ? { intencion: 'card_payment', motivo: 'pago-de-tarjeta', porUsuario: true, tarjetaId: e.tarjetaId }
          : { intencion: 'card_payment', motivo: 'falta-tarjeta', porUsuario: true };
      }
      case 'netted':
        return { intencion: 'netted', motivo: 'devolucion', porUsuario: true };
      default:
        return { intencion: e.decision, motivo: null, porUsuario: true };
    }
  }

  const sinElegir = (intencion: Decision, motivo: MotivoDeLinea | null, tarjetaId?: string) =>
    ({ intencion, motivo, porUsuario: false, tarjetaId });

  // El interruptor de los retiros pisa también lo que quedó sin anotar la vez pasada:
  // prenderlo es pedir que se anoten todos.
  if (ln.clase === 'withdrawal' && debito && plan.retirosComoGasto && l.estado !== 'borrada') {
    return sinElegir('expense', null);
  }
  if (l.estado === 'sin-anotar-antes') return sinElegir('skipped', 'sin-anotar-antes');
  if (l.estado === 'borrada') return sinElegir('pending', 'borrada');
  if (l.enlace) return sinElegir('linked', 'ya-estaba');

  if (debito && PUEDEN_SER_PAGO.includes(ln.clase)) {
    const tarjetaId = tarjetaPorUltimos4(plan, ln.ultimos4Contraparte);
    // Un pago de tarjeta nunca es un gasto: la compra con la tarjeta ya lo fue (0020).
    if (tarjetaId) return sinElegir('card_payment', 'pago-de-tarjeta', tarjetaId);
  }
  if (ln.clase === 'own_transfer') return sinElegir('skipped', 'entre-cuentas');
  if (ln.clase === 'transfer_out' && esCuentaPropia(plan, ln.ultimos4Contraparte)) {
    return sinElegir('skipped', 'entre-cuentas');
  }
  if (ln.clase === 'withdrawal' && debito) return sinElegir('skipped', 'retiro');

  if (l.posibles.length > 0) return sinElegir('pending', 'posible');

  if (APRENDEN.includes(ln.clase)) {
    const a = decisionAprendida(plan, ln);
    if (a) return sinElegir(a.intencion, a.motivo, a.tarjetaId);
  }

  switch (ln.clase) {
    case 'purchase':
    case 'fee': {
      if (!debito) return sinElegir('pending', 'otro');
      // Comprado y devuelto entero en el mismo estado: ni gasto ni ingreso.
      const r = devolucion;
      if (r && !r.bloqueada && r.estado !== 'borrada' && !eleccionDe(r).decision && !r.enlace &&
          r.posibles.length === 0 && r.linea.centavos === -ln.centavos) {
        return sinElegir('skipped', 'devuelta');
      }
      return sinElegir('expense', null);
    }
    case 'interest':
      return debito ? sinElegir('pending', 'otro') : sinElegir('income', null);
    case 'deposit':
      return debito ? sinElegir('pending', 'otro') : sinElegir('pending', 'deposito');
    case 'transfer_in':
      return sinElegir('pending', 'transferencia-recibida');
    case 'transfer_out':
      return sinElegir('pending', 'transferencia-enviada');
    case 'refund':
      return debito ? sinElegir('pending', 'otro') : sinElegir('pending', 'devolucion');
    default:
      return sinElegir('pending', 'otro');
  }
}

// ─── Los cambios ─────────────────────────────────────────────────────────────

/**
 * Las otras líneas del mismo comercio a las que se les puede pasar la categoría:
 * las que no tienen una elegida, y las que tienen la misma que esta. Esas
 * últimas son casi siempre las que se extendieron desde acá, y la subcategoría
 * se elige en un segundo cambio: sin contarlas, "Transporte" iba a las cuatro
 * compras y "Combustible" a una sola. Lo elegido distinto no se pisa.
 */
function extensibles(plan: Plan, l: LineaDelPlan, tipo: TransactionType): LineaDelPlan[] {
  const mk = l.linea.matchKey;
  if (!mk) return [];
  const propia = plan.elecciones[l.clave]?.categoria;
  const comoEsta = (m: LineaDelPlan) => {
    const suya = plan.elecciones[m.clave]?.categoria;
    if (!suya) return true;
    return !!propia && suya.categoria === propia.categoria && suya.subcategoria === propia.subcategoria;
  };
  return plan.lineas.filter(m =>
    m.clave !== l.clave && !m.bloqueada && m.linea.matchKey === mk &&
    esDebito(m) === esDebito(l) && m.intencion === tipo && comoEsta(m));
}

/**
 * Los movimientos y pagos con los que la persona puede enlazar una línea a mano
 * ("Ya está anotado"): primero lo que encontró `cotejar`, después lo de ±3 días
 * a cualquier monto, lo más parecido primero. Hasta 5, y ninguno que ya explique
 * otra línea.
 */
export function candidatosParaEnlazar(plan: Plan, clave: string): Candidato[] {
  const l = plan.lineas.find(x => x.clave === clave);
  if (!l || l.bloqueada) return [];
  const ln = l.linea;
  const usados = idsUsados(plan.ctx.lineasPrevias);
  const deOtras = new Set<string>();
  for (const o of plan.lineas) if (o.clave !== clave && o.enlace) deOtras.add(llaveDeCandidato(o.enlace));
  const libre = (c: Candidato) =>
    !usados.has(idDeCandidato(c)) && !deOtras.has(llaveDeCandidato(c)) && candidatoCompatible(ln, c);

  const propios: Candidato[] = [];
  if (l.cotejo.tipo === 'exacto') propios.push(l.cotejo.candidato);
  if (l.cotejo.tipo === 'posible') propios.push(...l.cotejo.candidatos);
  if (l.enlace) propios.push(l.enlace);

  const desde = sumarDias(ln.fecha, -3);
  const hasta = sumarDias(ln.asentada, 3);
  const monto = Math.abs(ln.centavos);
  const cerca: Candidato[] = [];
  for (const t of plan.ctx.movimientos) {
    const d = t.date.slice(0, 10);
    if (d >= desde && d <= hasta) cerca.push({ tipo: 'movimiento', movimiento: t, motivo: 'manual' });
  }
  if (ln.centavos < 0) {
    for (const p of plan.ctx.pagosDeTarjeta) {
      const d = p.date.slice(0, 10);
      if (d >= desde && d <= sumarDias(ln.asentada, 5)) cerca.push({ tipo: 'pago', pago: p, motivo: 'manual' });
    }
  }
  cerca.sort((a, b) =>
    Math.abs(centavosDeCandidato(a) - monto) - Math.abs(centavosDeCandidato(b) - monto) ||
    Math.abs(diasEntre(ln.fecha, fechaDeCandidato(a))) - Math.abs(diasEntre(ln.fecha, fechaDeCandidato(b))) ||
    porTexto(llaveDeCandidato(a), llaveDeCandidato(b)));

  const vistos = new Set<string>();
  const lista: Candidato[] = [];
  for (const c of [...propios, ...cerca]) {
    const k = llaveDeCandidato(c);
    if (vistos.has(k) || !libre(c)) continue;
    vistos.add(k);
    lista.push(c);
    if (lista.length === 5) break;
  }
  return lista;
}

/** La elección nueva de una línea, o null si el cambio no vale para ella. */
function eleccionNueva(plan: Plan, l: LineaDelPlan, cambio: CambioDePlan): EleccionDeLinea | null {
  const antes = plan.elecciones[l.clave] ?? {};
  // Lo que no es la decisión se conserva: la categoría y la descripción escritas no se pierden.
  const resto: EleccionDeLinea = {};
  if (antes.categoria) resto.categoria = antes.categoria;
  if (antes.descripcion !== undefined) resto.descripcion = antes.descripcion;
  if (antes.esOtro) resto.esOtro = true;
  const debito = esDebito(l);

  switch (cambio.tipo) {
    case 'decidir':
      if (!decisionValida(cambio.decision, debito)) return null;
      return { ...resto, decision: cambio.decision };
    case 'anotar-de-nuevo': {
      if (l.estado !== 'borrada' || !l.previa) return null;
      const hecho = l.previa.decision;
      if (hecho === 'card_payment') {
        const tarjetaId = tarjetaPorUltimos4(plan, l.linea.ultimos4Contraparte);
        return { ...resto, decision: 'card_payment', ...(tarjetaId ? { tarjetaId } : {}) };
      }
      if (hecho === 'netted' && !debito) return { ...resto, decision: 'netted' };
      if (hecho === 'skipped') return null;
      // Gasto, ingreso o un enlace con algo que ya no existe: se anota según su signo.
      return { ...resto, decision: debito ? 'expense' : 'income' };
    }
    case 'enlazar': {
      const k = llaveDeCandidato(cambio.candidato);
      if (!candidatosParaEnlazar(plan, l.clave).some(c => llaveDeCandidato(c) === k)) return null;
      return { ...resto, decision: 'linked', enlace: { tipo: cambio.candidato.tipo, id: cambio.candidato.id } };
    }
    case 'es-otro':
      return { ...resto, esOtro: true };
    case 'pagar-tarjeta':
      if (!debito || !tarjetasDeCredito(plan).some(c => c.id === cambio.tarjetaId)) return null;
      return { ...resto, decision: 'card_payment', tarjetaId: cambio.tarjetaId };
    case 'descontar':
      if (debito || l.linea.clase !== 'refund') return null;
      return { ...resto, decision: 'netted' };
    case 'descripcion': {
      const texto = cambio.descripcion.trim().slice(0, MAX_DESCRIPCION);
      const nueva: EleccionDeLinea = { ...antes };
      if (texto && texto !== l.linea.descripcion) nueva.descripcion = texto;
      else delete nueva.descripcion;
      return nueva;
    }
    default:
      return null;
  }
}

function esGrupo(destino: string): destino is GrupoDeRevision {
  return (ORDEN_DE_GRUPOS as string[]).includes(destino);
}

/**
 * Aplica lo que tocó la persona y devuelve el plan nuevo (el de entrada no se
 * modifica). Un cambio que no vale para ese destino devuelve el mismo plan.
 *
 * `destino`: la clave de una línea, un `GrupoDeRevision` (los botones de grupo)
 * o null (los interruptores, el libro y la cuenta).
 */
export function aplicarCambio(plan: Plan, destino: string | null, cambio: CambioDePlan): Plan {
  switch (cambio.tipo) {
    case 'retiros-como-gasto':
      return derivar({ ...plan, retirosComoGasto: cambio.valor });
    case 'crear-cargos-bancarios':
      return derivar({ ...plan, crearCargosBancarios: cambio.valor });
    // El libro y la cuenta se eligen arriba, antes de revisar, y cambian todo lo
    // de abajo: "Para revisar" se vuelve a armar desde cero. Las elecciones
    // quedan; una categoría elegida que no existe en el libro nuevo devuelve su
    // línea a "Para revisar" con «X» no existe en …
    case 'libro':
      return derivar({
        ...plan,
        ledgerId: cambio.ledgerId,
        ledgerName: cambio.ledgerName ?? null,
        categorias: cambio.categorias.filter(c => c.ledger_id === cambio.ledgerId),
        enRevision: {},
      });
    case 'cuenta': {
      const cuenta = elegirCuenta(plan.ctx.cards, plan.extracto, cambio.cardId);
      return derivar({
        ...plan,
        cuentaPedida: cambio.cardId,
        cuenta,
        lineas: lineasFijas(plan.extracto, plan.ctx, cuenta),
        enRevision: {},
      });
    }
  }
  if (destino === null) return plan;

  if (esGrupo(destino)) {
    if (cambio.tipo !== 'decidir' && cambio.tipo !== 'anotar-de-nuevo') return plan;
    const elecciones = { ...plan.elecciones };
    let cambio_ = false;
    for (const l of plan.lineas) {
      if (plan.enRevision[l.clave] !== destino || l.lista || l.bloqueada) continue;
      const nueva = eleccionNueva(plan, l, cambio);
      if (!nueva) continue;
      elecciones[l.clave] = nueva;
      cambio_ = true;
    }
    return cambio_ ? derivar({ ...plan, elecciones }) : plan;
  }

  const l = plan.lineas.find(x => x.clave === destino);
  if (!l || l.bloqueada) return plan;

  if (cambio.tipo === 'categoria') {
    const debito = esDebito(l);
    const tipo: TransactionType = l.intencion === 'expense' || l.intencion === 'income'
      ? l.intencion : debito ? 'expense' : 'income';
    const r = resolverElegida(plan, tipo, cambio.categoria, cambio.subcategoria);
    if (!r) return plan;
    const categoria = { categoria: r.categoria, subcategoria: r.subcategoria };
    const antes = plan.elecciones[l.clave] ?? {};
    const elecciones = { ...plan.elecciones };
    // Elegir una categoría es pedir que se anote: si la línea no iba a ser
    // gasto o ingreso, pasa a serlo.
    elecciones[l.clave] = l.intencion === tipo ? { ...antes, categoria } : { ...antes, categoria, decision: tipo };
    if (cambio.extender) {
      for (const m of extensibles(plan, l, tipo)) {
        elecciones[m.clave] = { ...(plan.elecciones[m.clave] ?? {}), categoria };
      }
    }
    return derivar({ ...plan, elecciones });
  }

  const nueva = eleccionNueva(plan, l, cambio);
  if (!nueva) return plan;
  return derivar({ ...plan, elecciones: { ...plan.elecciones, [l.clave]: nueva } });
}

// ─── La vista ────────────────────────────────────────────────────────────────

/** Cómo se pinta un monto: verde lo que entra, tinta lo que sale, apagado lo que no cuenta. */
export type RolDeMonto = 'ingreso' | 'gasto' | 'apagado';

export interface MontoDeFila {
  /** En centavos, siempre positivo. Una compra con devolución trae su neto. */
  centavos: number;
  signo: '+' | '−';
  rol: RolDeMonto;
}

export interface ChipDeCategoria {
  /** 'Transporte › Combustible'. */
  texto: string;
  categoria: string;
  subcategoria: string | null;
  /** 'nueva', 'neto de devolución', 'revisá': van al lado, más chicas. */
  notas: string[];
}

/**
 * Una píldora o botón de una fila. `cambio` null = abre la hoja de la línea
 * (hace falta elegir algo más, como la categoría). `elegida` la pinta en gris
 * (`bg-elevado`), nunca en verde.
 */
export interface AccionDeFila {
  id: string;
  texto: string;
  elegida: boolean;
  cambio: CambioDePlan | null;
}

export interface FilaDeVista {
  clave: string;
  /** La fecha de la compra ('3 sep'). */
  fecha: string;
  descripcion: string;
  categoria: ChipDeCategoria | null;
  monto: MontoDeFila;
  /** La razón en una línea. Null si no hace falta o si ya la dice el subtítulo del grupo. */
  motivo: string | null;
  /**
   * El candidato por el que se pregunta ("¿Ya lo anotaste?"): 'Super · 3 sep'
   * y su monto en centavos, que la app formatea y agrega al final.
   */
  candidato: { texto: string; centavos: number } | null;
  bloqueada: boolean;
  /** Ya tiene todo para importarse. */
  decidida: boolean;
  /** Las píldoras de la fila. Solo en "Para revisar"; en el resto, tocar la fila abre la hoja. */
  acciones: AccionDeFila[];
}

/** Un interruptor: `cambio` es el que lo da vuelta. */
export interface InterruptorDeVista {
  texto: string;
  valor: boolean;
  cambio: CambioDePlan;
}

/** Un botón que decide un grupo entero: `aplicarCambio(plan, destino, cambio)`. */
export interface BotonDeGrupo {
  texto: string;
  destino: GrupoDeRevision;
  cambio: CambioDePlan;
}

export interface GrupoDeVista {
  id: string;
  /** El subtítulo ('Depósitos · 3' o la razón de "No se anotan"). Null = sin subtítulo. */
  titulo: string | null;
  pregunta: string | null;
  /** '1 de 3 decididos', en "Para revisar". */
  nota: string | null;
  botones: BotonDeGrupo[];
  interruptor: InterruptorDeVista | null;
  filas: FilaDeVista[];
}

export type IdDeSeccion = 'revisar' | 'se-anotan' | 'pagos' | 'ya-estaban' | 'no-se-anotan' | 'ya-importados';

/** En este orden van debajo del resumen. */
export const ORDEN_DE_SECCIONES: IdDeSeccion[] = [
  'revisar', 'se-anotan', 'pagos', 'ya-estaban', 'no-se-anotan', 'ya-importados',
];

export interface SeccionDeVista {
  id: IdDeSeccion;
  /** 'Se anotan · 12'. */
  titulo: string;
  /** Cuántas filas tiene. */
  n: number;
  /** Arranca plegada (lo que no pide nada: ya estaban, no se anotan, ya importados). */
  plegada: boolean;
  nota: string | null;
  /** Solo en "Se anotan": `+ingresos` en acento y `−gastos` en tinta. */
  totales: { ingresosCentavos: number; gastosCentavos: number } | null;
  grupos: GrupoDeVista[];
}

export type IdDeAviso =
  | 'migracion' | 'moneda' | 'cuenta-ajena' | 'cuenta-varias' | 'cuenta-nueva' | 'cuenta-sin-ultimos4'
  | 'cargos-bancarios';

export interface AvisoDeVista {
  id: IdDeAviso;
  texto: string;
  /** Mientras esté, no se puede importar. */
  bloquea: boolean;
  /** Un botón ('Usar la que corresponde') o la etiqueta del selector de `opciones` ('Elegir otra'). */
  accion: { texto: string; cambio: CambioDePlan | null } | null;
  /** Para elegir la cuenta: cada una con el cambio que la elige. */
  opciones: { id: string; texto: string; cambio: CambioDePlan }[];
  interruptor: InterruptorDeVista | null;
}

export interface ResumenDeVista {
  /** 'Cuenta Digital Libre ··3456', con '(archivada)' si lo está. */
  titulo: string;
  /** 'Banco Popular · 24 ago – 22 sep 2026'. */
  subtitulo: string;
  /** 'Cuadra con el banco · 68 movimientos'. */
  insignia: string;
  /** Para `textoDeSaldos(anterior, alCorte)` con los montos formateados. */
  saldoInicialCentavos: number;
  saldoFinalCentavos: number;
  avisos: AvisoDeVista[];
  /**
   * Una por resultado con algo, en el orden de las secciones. `id` es el
   * resultado y `seccion`, adonde lleva: la suya o, si sus filas siguen todas
   * en "Para revisar", esa. Dos conteos pueden llevar al mismo lugar.
   */
  conteos: { id: IdDeSeccion; seccion: IdDeSeccion; n: number; texto: string }[];
  /** 'Para revisar: 4. Si no los decidís, no se anotan.', o null. */
  paraRevisar: string | null;
}

export interface VistaDelPlan {
  resumen: ResumenDeVista;
  /** Solo las que tienen algo, en `ORDEN_DE_SECCIONES`. */
  secciones: SeccionDeVista[];
  /** Para `textoDelPie(gastos, ingresos, sinDecidir)` con los montos formateados. */
  pie: { gastosCentavos: number; ingresosCentavos: number; sinDecidir: number };
  /** El botón de importar: va arriba y abajo. */
  boton: { texto: string; habilitado: boolean; n: number };
}

function fechaDe(plan: Plan, iso: string): string {
  return T.fechaDeFila(iso, plan.hoy);
}

/** 'Super · 3 sep' o 'Pago a Visa ··1111 · 3 sep'. */
function textoDeCandidato(plan: Plan, c: Candidato): string {
  if (c.tipo === 'pago') return `${T.OPCIONES.pagoDeTarjeta} · ${nombreDeTarjeta(plan, c.pago.card_id)} · ${fechaDe(plan, c.pago.date)}`;
  return `${c.movimiento.description || c.movimiento.category} · ${fechaDe(plan, c.movimiento.date)}`;
}

/** 'vía WhatsApp · Transporte': cómo llegó y dónde está. */
function detalleDeCandidato(plan: Plan, c: Candidato): string | null {
  if (c.tipo === 'pago') return null;
  const m = c.movimiento;
  const partes = [T.ORIGEN[m.source], T.textoDeCategoria(m.category, m.subcategory)];
  if (m.author_id !== plan.ctx.yo && m.author_name) partes.push(m.author_name);
  return partes.filter(Boolean).join(' · ');
}

function textoDelMotivo(plan: Plan, l: LineaDelPlan): string | null {
  const ln = l.linea;
  switch (l.motivo) {
    case null:
      return null;
    case 'ya-importada':
      return T.YA_IMPORTADO;
    case 'borrada':
      return T.BORRADA;
    case 'deposito':
      return T.DEPOSITO;
    case 'transferencia-recibida':
      return T.transferenciaRecibida(ln.ultimos4Contraparte);
    case 'transferencia-enviada':
      return T.transferenciaEnviada(ln.ultimos4Contraparte);
    case 'posible': {
      const c = l.posibles[0];
      if (c && c.tipo === 'movimiento' && c.motivo === 'pareja') {
        return T.loAnotoOtro(c.movimiento.author_name, fechaDe(plan, c.movimiento.date));
      }
      return T.YA_LO_ANOTASTE;
    }
    case 'devolucion':
      return T.DEVOLUCION_SIN_COMPRA;
    case 'otro':
      return T.SIN_RECONOCER;
    case 'sin-categoria':
      return T.ELEGI_UNA_CATEGORIA;
    case 'categoria-inexistente':
      return T.categoriaInexistente(l.categoriaFaltante ?? '', plan.ledgerName);
    case 'falta-tarjeta':
      return T.ELEGI_LA_TARJETA;
    case 'pago-de-tarjeta':
      return T.pagoDeTarjeta(nombreDeTarjeta(plan, l.tarjetaId));
    case 'ya-estaba': {
      const c = l.enlace;
      if (!c) return T.YA_LO_ANOTASTE;
      if (c.tipo === 'pago') return T.yaEstabaElPago(nombreDeTarjeta(plan, c.pago.card_id), fechaDe(plan, c.pago.date));
      return T.yaEstabaAnotado(c.movimiento.description || c.movimiento.category,
        fechaDe(plan, c.movimiento.date), c.movimiento.source);
    }
    default:
      return T.NO_SE_ANOTA[l.motivo];
  }
}

function chipDe(l: LineaDelPlan): ChipDeCategoria | null {
  if (!l.categoria || (l.intencion !== 'expense' && l.intencion !== 'income')) return null;
  const notas: string[] = [];
  if (l.categoriaNueva) notas.push(T.NOTAS_DE_CATEGORIA.nueva);
  if (l.netoCentavos !== null) notas.push(T.NOTAS_DE_CATEGORIA.neto);
  if (l.origenCategoria === 'respaldo') notas.push(T.NOTAS_DE_CATEGORIA.revisa);
  return {
    texto: T.textoDeCategoria(l.categoria, l.subcategoria),
    categoria: l.categoria,
    subcategoria: l.subcategoria,
    notas,
  };
}

function montoDe(l: LineaDelPlan, apagado: boolean): MontoDeFila {
  const debito = esDebito(l);
  return {
    centavos: l.netoCentavos ?? Math.abs(l.linea.centavos),
    signo: debito ? '−' : '+',
    rol: apagado ? 'apagado' : debito ? 'gasto' : 'ingreso',
  };
}

function pildora(id: string, texto: string, cambio: CambioDePlan | null, elegida: boolean): AccionDeFila {
  return { id, texto, cambio, elegida };
}

/** Las píldoras de una fila de "Para revisar", según la pregunta de su grupo. */
function accionesDeRevision(plan: Plan, l: LineaDelPlan, grupo: GrupoDeRevision): AccionDeFila[] {
  const debito = esDebito(l);
  const e = plan.elecciones[l.clave] ?? {};
  const eligio = (d: Decision) => l.porUsuario && l.intencion === d;
  const anotar = debito
    ? pildora('expense', T.OPCIONES.gasto, { tipo: 'decidir', decision: 'expense' }, eligio('expense'))
    : pildora('income', T.OPCIONES.ingreso, { tipo: 'decidir', decision: 'income' }, eligio('income'));
  const noAnotar = pildora('skipped', T.OPCIONES.noAnotar, { tipo: 'decidir', decision: 'skipped' }, eligio('skipped'));

  switch (grupo) {
    case 'ya-anotado': {
      const c = l.enlace ?? l.posibles[0] ?? null;
      const acciones = [
        pildora('mismo', T.OPCIONES.esElMismo, c ? { tipo: 'enlazar', candidato: refDeCandidato(c) } : null,
          l.intencion === 'linked' && l.lista),
        pildora('otro', T.OPCIONES.esOtro, { tipo: 'es-otro' }, !!e.esOtro && l.intencion !== 'linked'),
      ];
      // "Es otro" en algo que igual hay que decidir (un depósito): se pregunta lo suyo.
      if (e.esOtro && l.intencion !== 'expense' && l.intencion !== 'income' && l.intencion !== 'linked') {
        acciones.push(anotar, noAnotar);
      }
      return acciones;
    }
    case 'depositos':
      return [
        pildora('income', T.OPCIONES.esIngreso, { tipo: 'decidir', decision: 'income' }, eligio('income')),
        pildora('skipped', T.OPCIONES.esPlataMia, { tipo: 'decidir', decision: 'skipped' }, eligio('skipped')),
      ];
    case 'devoluciones': {
      const acciones: AccionDeFila[] = [];
      if (puedeDescontarse(plan, l)) {
        acciones.push(pildora('netted', T.OPCIONES.descontar, { tipo: 'descontar' }, l.intencion === 'netted' && l.lista));
      }
      acciones.push(anotar, noAnotar);
      return acciones;
    }
    case 'sin-categoria':
      return [
        pildora('categoria', T.OPCIONES.elegirCategoria, null, l.lista && l.categoria !== null),
        noAnotar,
      ];
    case 'borrados':
      return [
        pildora('anotar', T.OPCIONES.anotarDeNuevo, { tipo: 'anotar-de-nuevo' },
          l.porUsuario && l.intencion !== 'skipped'),
        noAnotar,
      ];
    default:
      return [anotar, noAnotar];
  }
}

function botonesDeGrupo(grupo: GrupoDeRevision): BotonDeGrupo[] {
  const b = (texto: string, cambio: CambioDePlan): BotonDeGrupo => ({ texto, destino: grupo, cambio });
  const B = T.BOTONES_DE_GRUPO;
  switch (grupo) {
    case 'depositos':
      return [b(B.sonIngresos, { tipo: 'decidir', decision: 'income' }), b(B.sonPlataMia, { tipo: 'decidir', decision: 'skipped' })];
    case 'te-transfirieron':
      return [b(B.sonIngresos, { tipo: 'decidir', decision: 'income' }), b(B.noAnotar, { tipo: 'decidir', decision: 'skipped' })];
    case 'transferiste':
      return [b(B.sonGastos, { tipo: 'decidir', decision: 'expense' }), b(B.noAnotar, { tipo: 'decidir', decision: 'skipped' })];
    case 'borrados':
      return [b(B.anotarDeNuevo, { tipo: 'anotar-de-nuevo' }), b(B.noAnotar, { tipo: 'decidir', decision: 'skipped' })];
    default:
      return [];
  }
}

function filaDe(plan: Plan, l: LineaDelPlan, seccion: IdDeSeccion, grupo?: GrupoDeRevision): FilaDeVista {
  const apagado = seccion === 'no-se-anotan' || seccion === 'ya-importados';
  const c = l.motivo === 'posible' ? l.posibles[0] : undefined;
  return {
    clave: l.clave,
    fecha: fechaDe(plan, l.linea.fecha),
    descripcion: l.descripcion,
    categoria: chipDe(l),
    monto: montoDe(l, apagado),
    // En "No se anotan" la razón es el subtítulo del grupo.
    motivo: seccion === 'no-se-anotan' ? null : textoDelMotivo(plan, l),
    candidato: c ? { texto: textoDeCandidato(plan, c), centavos: centavosDeCandidato(c) } : null,
    bloqueada: l.bloqueada,
    decidida: l.lista,
    acciones: grupo ? accionesDeRevision(plan, l, grupo) : [],
  };
}

/** A qué sección va una línea fuera de "Para revisar": por lo que le va a pasar. */
function seccionPorResultado(l: LineaDelPlan): IdDeSeccion {
  if (l.bloqueada) return 'ya-importados';
  switch (l.intencion) {
    case 'expense':
    case 'income':
      return 'se-anotan';
    case 'card_payment':
      return 'pagos';
    case 'linked':
      return 'ya-estaban';
    default:
      return 'no-se-anotan';
  }
}

/** El orden de los subtítulos de "No se anotan". */
const RAZONES_SIN_ANOTAR: (keyof typeof T.NO_SE_ANOTA)[] = [
  'retiro', 'entre-cuentas', 'devuelta', 'sigue-a-su-compra', 'descontada', 'aprendida', 'sin-anotar-antes', 'elegida',
];

function avisosDe(plan: Plan): AvisoDeVista[] {
  const { extracto, ctx } = plan;
  const avisos: AvisoDeVista[] = [];
  const aviso = (id: IdDeAviso, texto: string, bloquea: boolean, extra: Partial<AvisoDeVista> = {}): void => {
    avisos.push({ id, texto, bloquea, accion: null, opciones: [], interruptor: null, ...extra });
  };
  const opcionDe = (c: { id: string; name: string; last4: string; archived: boolean }) => ({
    id: c.id,
    texto: T.nombreConUltimos4(c.name, c.last4) + (c.archived ? ` ${T.ARCHIVADA}` : ''),
    cambio: { tipo: 'cuenta', cardId: c.id } as CambioDePlan,
  });

  if (!ctx.migracionLista) aviso('migracion', FALTA_MIGRACION, true);
  if (ctx.moneda && extracto.moneda !== ctx.moneda) {
    aviso('moneda', T.avisoOtraMoneda(extracto.moneda, ctx.moneda), true);
  }

  const cuenta = plan.cuenta;
  switch (cuenta.tipo) {
    case 'bloqueada':
      aviso('cuenta-ajena', T.avisoCuentaAjena(extracto.ultimos4, cuenta.card.name), true, {
        accion: { texto: T.USAR_LA_QUE_CORRESPONDE, cambio: { tipo: 'cuenta', cardId: null } },
      });
      break;
    case 'varias':
      aviso('cuenta-varias', T.avisoVariasCuentas(extracto.ultimos4), true, {
        opciones: cuenta.candidatas.map(opcionDe),
      });
      break;
    case 'ninguna': {
      const otras = cuentasElegibles(ctx.cards, extracto.ultimos4);
      aviso('cuenta-nueva', T.avisoCuentaNueva(cuenta.propuesta.name, extracto.ultimos4), false, {
        accion: otras.length > 0 ? { texto: T.ELEGIR_OTRA, cambio: null } : null,
        opciones: otras.map(opcionDe),
      });
      break;
    }
    case 'completar':
      aviso('cuenta-sin-ultimos4', T.avisoCompletarUltimos4(cuenta.card.name, extracto.ultimos4), false);
      break;
  }

  if (plan.necesitaCargosBancarios) {
    aviso('cargos-bancarios', T.avisoSinCategoriaDeCargos(plan.ledgerName), false, {
      interruptor: {
        texto: T.interruptorCrearCategoria(CARGOS_BANCARIOS),
        valor: plan.crearCargosBancarios,
        cambio: { tipo: 'crear-cargos-bancarios', valor: !plan.crearCargosBancarios },
      },
    });
  }
  return avisos;
}

function tituloDelResumen(plan: Plan): string {
  const { extracto } = plan;
  const c = plan.cuenta;
  if (c.tipo === 'una' || c.tipo === 'completar') {
    const nombre = T.nombreConUltimos4(c.card.name, extracto.ultimos4);
    return c.card.archived ? `${nombre} ${T.ARCHIVADA}` : nombre;
  }
  if (c.tipo === 'ninguna') return T.nombreConUltimos4(c.propuesta.name, extracto.ultimos4);
  return T.nombreConUltimos4(nombreDeProducto(extracto.producto) || T.nombreDelBanco(extracto.banco), extracto.ultimos4);
}

/** Todo lo que muestra la pantalla de revisión, ya calculado. */
export function vistaDelPlan(plan: Plan): VistaDelPlan {
  const { lineas } = plan;

  // ── Los resultados: lo que va a pasar, esté la fila donde esté.
  let gastos = 0, ingresos = 0, pagos = 0, yaEstaban = 0, noSeAnotan = 0, importados = 0, sinDecidir = 0;
  let gastosCentavos = 0, ingresosCentavos = 0;
  for (const l of lineas) {
    if (l.bloqueada) { importados++; continue; }
    if (!l.lista) { sinDecidir++; continue; }
    switch (l.intencion) {
      case 'expense': gastos++; gastosCentavos += l.netoCentavos ?? -l.linea.centavos; break;
      case 'income': ingresos++; ingresosCentavos += l.linea.centavos; break;
      case 'card_payment': pagos++; break;
      case 'linked': yaEstaban++; break;
      default: noSeAnotan++;
    }
  }

  // ── Las secciones.
  const filasPorSeccion: Record<IdDeSeccion, LineaDelPlan[]> = {
    revisar: [], 'se-anotan': [], pagos: [], 'ya-estaban': [], 'no-se-anotan': [], 'ya-importados': [],
  };
  for (const l of lineas) {
    const s = !l.bloqueada && plan.enRevision[l.clave] ? 'revisar' : seccionPorResultado(l);
    filasPorSeccion[s].push(l);
  }

  const secciones: SeccionDeVista[] = [];
  const seccion = (id: IdDeSeccion, grupos: GrupoDeVista[], extra: Partial<SeccionDeVista> = {}) => {
    const n = filasPorSeccion[id].length;
    secciones.push({
      id, titulo: T.tituloConCuenta(T.TITULOS_DE_SECCION[id], n), n,
      plegada: id === 'ya-estaban' || id === 'no-se-anotan' || id === 'ya-importados',
      nota: null, totales: null, grupos, ...extra,
    });
  };
  const grupoSimple = (id: IdDeSeccion): GrupoDeVista => ({
    id, titulo: null, pregunta: null, nota: null, botones: [], interruptor: null,
    filas: filasPorSeccion[id].map(l => filaDe(plan, l, id)),
  });

  // Para revisar: por pregunta.
  const aRevisar = filasPorSeccion.revisar;
  if (aRevisar.length > 0) {
    const grupos: GrupoDeVista[] = [];
    for (const g of ORDEN_DE_GRUPOS) {
      const del = aRevisar.filter(l => plan.enRevision[l.clave] === g);
      if (del.length === 0) continue;
      const decididas = del.filter(l => l.lista).length;
      const info = T.GRUPOS_DE_REVISION[g];
      grupos.push({
        id: g,
        titulo: T.tituloConCuenta(info.titulo, del.length),
        pregunta: info.pregunta,
        nota: T.decididos(decididas, del.length),
        botones: decididas < del.length ? botonesDeGrupo(g) : [],
        interruptor: null,
        filas: del.map(l => filaDe(plan, l, 'revisar', g)),
      });
    }
    const decididas = aRevisar.filter(l => l.lista).length;
    seccion('revisar', grupos, { nota: T.decididos(decididas, aRevisar.length) });
  }

  if (filasPorSeccion['se-anotan'].length > 0) {
    let mas = 0, menos = 0;
    for (const l of filasPorSeccion['se-anotan']) {
      if (l.intencion === 'income') mas += l.linea.centavos;
      else menos += l.netoCentavos ?? -l.linea.centavos;
    }
    seccion('se-anotan', [grupoSimple('se-anotan')], { totales: { ingresosCentavos: mas, gastosCentavos: menos } });
  }
  if (filasPorSeccion.pagos.length > 0) seccion('pagos', [grupoSimple('pagos')]);
  if (filasPorSeccion['ya-estaban'].length > 0) seccion('ya-estaban', [grupoSimple('ya-estaban')]);

  // No se anotan: por razón. El interruptor de los retiros vive en su
  // subtítulo y no desaparece al prenderlo, aunque los retiros se muden.
  const hayRetiros = lineas.some(l =>
    !l.bloqueada && l.linea.clase === 'withdrawal' && esDebito(l) && !plan.elecciones[l.clave]?.decision);
  const sinAnotar = filasPorSeccion['no-se-anotan'];
  if (sinAnotar.length > 0 || hayRetiros) {
    const grupos: GrupoDeVista[] = [];
    for (const razon of RAZONES_SIN_ANOTAR) {
      const del = sinAnotar.filter(l => (l.motivo ?? 'elegida') === razon);
      const conInterruptor = razon === 'retiro' && hayRetiros;
      if (del.length === 0 && !conInterruptor) continue;
      grupos.push({
        id: razon,
        titulo: razon === 'retiro' && plan.retirosComoGasto ? T.RETIROS_COMO_GASTO : T.NO_SE_ANOTA[razon],
        pregunta: null,
        nota: null,
        botones: [],
        interruptor: conInterruptor
          ? {
            texto: T.INTERRUPTOR_RETIROS,
            valor: plan.retirosComoGasto,
            cambio: { tipo: 'retiros-como-gasto', valor: !plan.retirosComoGasto },
          }
          : null,
        filas: del.map(l => filaDe(plan, l, 'no-se-anotan')),
      });
    }
    // Lo que no encaja en ninguna razón conocida va al final, sin perderse.
    const sueltas = sinAnotar.filter(l => !RAZONES_SIN_ANOTAR.includes((l.motivo ?? 'elegida') as typeof RAZONES_SIN_ANOTAR[number]));
    if (sueltas.length > 0) {
      grupos.push({
        id: 'otras', titulo: null, pregunta: null, nota: null, botones: [], interruptor: null,
        filas: sueltas.map(l => filaDe(plan, l, 'no-se-anotan')),
      });
    }
    seccion('no-se-anotan', grupos);
  }

  if (filasPorSeccion['ya-importados'].length > 0) {
    seccion('ya-importados', [grupoSimple('ya-importados')], {
      nota: T.notaYaImportados(filasPorSeccion['ya-importados'].length),
    });
  }

  // ── El resumen.
  const avisos = avisosDe(plan);
  const conteos: ResumenDeVista['conteos'] = [];
  // Lo decidido en "Para revisar" se cuenta por su resultado pero se queda
  // allá: si todo lo de un resultado vino de ahí, su sección no existe y el
  // conteo lleva a donde están esas filas.
  const conteo = (id: IdDeSeccion, n: number, texto: string) => {
    const seccion = secciones.some(s => s.id === id) ? id : 'revisar';
    conteos.push({ id, seccion, n, texto });
  };
  if (gastos + ingresos > 0) conteo('se-anotan', gastos + ingresos, T.conteoSeAnotan(gastos, ingresos));
  if (pagos > 0) conteo('pagos', pagos, T.conteoPagos(pagos));
  if (yaEstaban > 0) conteo('ya-estaban', yaEstaban, T.conteoYaEstaban(yaEstaban));
  if (noSeAnotan > 0) conteo('no-se-anotan', noSeAnotan, T.conteoNoSeAnotan(noSeAnotan));
  if (importados > 0) conteo('ya-importados', importados, T.conteoYaImportados(importados));

  // ── El botón. Cuenta las líneas que hacen algo en la base: lo que se anota,
  //    los pagos y los enlaces. Lo que no se anota igual se manda, pero solo
  //    no se anota de nuevo.
  const n = gastos + ingresos + pagos + yaEstaban;
  let boton: VistaDelPlan['boton'];
  const todasPrevias = lineas.length > 0 && lineas.every(l => l.previa !== null);
  if (n === 0 && sinDecidir > 0) {
    // Es justo lo que pide el pie: volver a subir el PDF para decidir lo que
    // quedó. "Ya se importó" o "nada nuevo" dirían que no hay nada que hacer.
    boton = { texto: T.FALTA_DECIDIR, habilitado: false, n };
  } else if (n === 0 && todasPrevias) {
    const ultima = lineas.reduce((max, l) => (l.previa && l.previa.created_at > max ? l.previa.created_at : max), '');
    boton = { texto: T.yaSeImporto(fechaDe(plan, ultima)), habilitado: false, n };
  } else if (n === 0) {
    boton = { texto: T.NADA_NUEVO, habilitado: false, n };
  } else {
    boton = { texto: T.botonImportar(n), habilitado: !avisos.some(a => a.bloquea), n };
  }

  return {
    resumen: {
      titulo: tituloDelResumen(plan),
      subtitulo: T.subtituloDelResumen(plan.extracto.banco, plan.extracto.desde, plan.extracto.hasta),
      insignia: T.insigniaCuadra(lineas.length),
      saldoInicialCentavos: plan.extracto.saldoInicialCentavos,
      saldoFinalCentavos: plan.extracto.saldoFinalCentavos,
      avisos,
      conteos,
      paraRevisar: sinDecidir > 0 ? T.avisoParaRevisar(sinDecidir) : null,
    },
    secciones,
    pie: { gastosCentavos, ingresosCentavos, sinDecidir },
    boton,
  };
}

// ─── La hoja de una línea ────────────────────────────────────────────────────

export interface OpcionDeHoja {
  id: DecisionElegible;
  texto: string;
  elegida: boolean;
  /** Null = hay que elegir algo más abajo (el candidato, la tarjeta). */
  cambio: CambioDePlan | null;
}

export interface HojaDeLinea {
  clave: string;
  titulo: string;
  descripcion: string;
  monto: MontoDeFila;
  /** 'Banco: 1 sep · Compra: 31 ago'. No se editan. */
  fechas: string;
  bloqueada: boolean;
  /** La razón de la línea (o por qué no se puede tocar). */
  motivo: string | null;
  /** Solo las que valen para su signo y su contexto. */
  opciones: OpcionDeHoja[];
  /** Para "Ya está anotado". */
  candidatos: { id: string; texto: string; detalle: string | null; centavos: number; elegido: boolean; cambio: CambioDePlan }[];
  /** Para "Pago de tarjeta". */
  tarjetas: { id: string; texto: string; elegida: boolean; cambio: CambioDePlan }[];
  /**
   * Solo si se anota como gasto o ingreso. `porque` es la línea chica que
   * explica la sugerencia; con la categoría elegida a mano, null.
   */
  categoria: { tipo: TransactionType; categoria: string | null; subcategoria: string | null; porque: string | null } | null;
  /** "Usar esta categoría en las otras 3 de Shell": la casilla, prendida por defecto. */
  extender: { n: number; texto: string } | null;
  listo: string;
}

export function hojaDeLinea(plan: Plan, clave: string): HojaDeLinea | null {
  const l = plan.lineas.find(x => x.clave === clave);
  if (!l) return null;
  const ln = l.linea;
  const debito = esDebito(l);
  const base = {
    clave,
    titulo: T.HOJA.titulo,
    descripcion: l.descripcion,
    monto: montoDe(l, l.bloqueada),
    fechas: T.fechasDeLaHoja(fechaDe(plan, ln.asentada), fechaDe(plan, ln.fecha)),
    listo: T.HOJA.listo,
  };
  if (l.bloqueada) {
    return {
      ...base, bloqueada: true, motivo: T.HOJA.bloqueada, opciones: [], candidatos: [], tarjetas: [],
      categoria: null, extender: null,
    };
  }

  const candidatos = candidatosParaEnlazar(plan, clave);
  const tarjetas = debito ? tarjetasDeCredito(plan) : [];
  const enlazado = l.intencion === 'linked' && l.enlace ? llaveDeCandidato(l.enlace) : null;
  const opciones: OpcionDeHoja[] = [];
  const opcion = (id: DecisionElegible, texto: string, cambio: CambioDePlan | null) =>
    opciones.push({ id, texto, elegida: l.intencion === id, cambio });

  if (debito) opcion('expense', T.OPCIONES.gasto, { tipo: 'decidir', decision: 'expense' });
  else opcion('income', T.OPCIONES.ingreso, { tipo: 'decidir', decision: 'income' });
  if (candidatos.length > 0) {
    opcion('linked', T.OPCIONES.yaEstaAnotado,
      candidatos.length === 1 ? { tipo: 'enlazar', candidato: refDeCandidato(candidatos[0]) } : null);
  }
  if (tarjetas.length > 0) {
    opcion('card_payment', T.OPCIONES.pagoDeTarjeta,
      tarjetas.length === 1 ? { tipo: 'pagar-tarjeta', tarjetaId: tarjetas[0].id } : null);
  }
  if (puedeDescontarse(plan, l)) opcion('netted', T.OPCIONES.descontar, { tipo: 'descontar' });
  opcion('skipped', T.OPCIONES.noAnotar, { tipo: 'decidir', decision: 'skipped' });

  let categoria: HojaDeLinea['categoria'] = null;
  let extender: HojaDeLinea['extender'] = null;
  if (l.intencion === 'expense' || l.intencion === 'income') {
    const tipo: TransactionType = l.intencion;
    let porque: string | null = null;
    switch (l.origenCategoria) {
      case 'historial': porque = T.PORQUE.historial; break;
      case 'respaldo': porque = l.categoria ? T.porqueRespaldo(l.categoria) : null; break;
      case 'regla':
        porque = l.categoriaNueva ? T.PORQUE.nueva
          : ln.clase === 'fee' ? T.PORQUE.cargo
            : ln.clase === 'interest' ? T.PORQUE.interes
              : T.PORQUE.comercio;
        break;
      case 'elegida': porque = l.categoriaNueva ? T.PORQUE.nueva : null; break;
      default: porque = textoDelMotivo(plan, l);
    }
    categoria = { tipo, categoria: l.categoria, subcategoria: l.subcategoria, porque };
    const otras = extensibles(plan, l, tipo).length;
    if (otras > 0) extender = { n: otras, texto: T.extenderCategoria(otras, ln.comercio || l.descripcion) };
  }

  return {
    ...base,
    bloqueada: false,
    motivo: textoDelMotivo(plan, l),
    opciones,
    candidatos: candidatos.map(c => ({
      id: llaveDeCandidato(c),
      texto: textoDeCandidato(plan, c),
      detalle: detalleDeCandidato(plan, c),
      centavos: centavosDeCandidato(c),
      elegido: llaveDeCandidato(c) === enlazado,
      cambio: { tipo: 'enlazar', candidato: refDeCandidato(c) } as CambioDePlan,
    })),
    tarjetas: tarjetas.map(c => ({
      id: c.id,
      texto: T.nombreConUltimos4(c.name, c.last4) + (c.archived ? ` ${T.ARCHIVADA}` : ''),
      elegida: l.intencion === 'card_payment' && l.tarjetaId === c.id,
      cambio: { tipo: 'pagar-tarjeta', tarjetaId: c.id } as CambioDePlan,
    })),
    categoria,
    extender,
  };
}

// ─── El pedido ───────────────────────────────────────────────────────────────

/**
 * Lo que se manda a `importar_estado_de_cuenta`. TODAS las líneas, en orden:
 * la función vuelve a cuadrar la cadena de saldos entera y arma las claves
 * ella misma. Lo bloqueado y lo que sigue sin decidir va como 'pending'.
 *
 * Los montos salen de los centavos del banco, nunca de un decimal.
 *
 * Solo se llama con el botón habilitado: con la cuenta sin decidir (varias o
 * de otra) no hay pedido posible, y tira.
 */
export function armarPedido(plan: Plan): PedidoDeImportacion {
  const { extracto, cuenta } = plan;
  if (cuenta.tipo === 'varias' || cuenta.tipo === 'bloqueada') {
    throw new Error('Falta decidir de qué cuenta es el estado: no se puede importar.');
  }
  const card = cardDeLaCuenta(cuenta);

  const lineas = plan.lineas.map((l): LineaDePedido => {
    const ln = l.linea;
    const fila: LineaDePedido = {
      posted: ln.asentada,
      date: ln.fecha,
      cents: ln.centavos,
      balance: ln.saldoCentavos,
      kind: ln.clase,
      decision: l.decision,
      match_key: ln.matchKey.slice(0, 60),
    };
    switch (l.decision) {
      case 'expense':
      case 'income':
        fila.category = l.categoria ?? undefined;
        fila.subcategory = l.subcategoria;
        fila.description = l.descripcion;
        if (l.netoCentavos !== null) fila.net_cents = l.netoCentavos;
        break;
      case 'linked':
        if (l.enlace?.tipo === 'movimiento') fila.transaction_id = l.enlace.movimiento.id;
        if (l.enlace?.tipo === 'pago') fila.card_payment_id = l.enlace.pago.id;
        break;
      case 'card_payment':
        fila.credit_card_id = l.tarjetaId ?? undefined;
        break;
      case 'netted':
        fila.nets_key = l.descuentaDe ?? undefined;
        break;
    }
    return fila;
  });

  const pedido: PedidoDeImportacion = {
    cab: {
      bank: extracto.banco,
      last4: extracto.ultimos4,
      account_card_id: card ? card.id : null,
      ledger_id: plan.ledgerId,
      opening_cents: extracto.saldoInicialCentavos,
      closing_cents: extracto.saldoFinalCentavos,
      line_count: extracto.lineas.length,
    },
    lineas,
  };
  if (cuenta.tipo === 'ninguna') pedido.cuentaNueva = cuenta.propuesta;
  if (cuenta.tipo === 'completar') pedido.completarLast4 = { card_id: cuenta.card.id, last4: extracto.ultimos4 };
  if (plan.lineas.some(l => l.decision === 'expense' && l.categoriaNueva)) {
    pedido.categoriasNuevas = [{ ledger_id: plan.ledgerId, name: CARGOS_BANCARIOS, type: 'expense' }];
  }
  return pedido;
}

/**
 * Lo que un pedido crea antes de anotar, por el nombre con que se muestra: la
 * cuenta nueva y la categoría de cargos. Deshacer no lo borra, y la pantalla
 * de después tiene que decirlo (`textoDeshecho`).
 */
export function loQueSeCrea(pedido: PedidoDeImportacion): { cuenta: string | null; categoria: string | null } {
  const { cuentaNueva } = pedido;
  return {
    cuenta: cuentaNueva ? T.nombreConUltimos4(cuentaNueva.name, cuentaNueva.last4) : null,
    categoria: pedido.categoriasNuevas?.[0]?.name ?? null,
  };
}
