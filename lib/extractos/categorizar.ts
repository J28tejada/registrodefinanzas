/**
 * La categoría que se le sugiere a una línea del banco. Sin IA.
 *
 * En orden: lo que la persona hizo antes con ese mismo comercio, después unas
 * reglas por nombre, después el "Otros" de ese tipo, y si nada de eso existe,
 * nada: la línea queda para revisar con "Elegí una categoría".
 *
 * Solo devuelve nombres que EXISTEN en la cuenta destino y con ese tipo. Las
 * categorías son por cuenta (0018) y la función SQL rechaza una que no esté
 * (CATEGORIA_INVALIDA); sugerir una inexistente sería ofrecer un botón que
 * falla. Filtrar por tipo es además lo que impide que un cargo del banco
 * caiga en "Comisiones", que es una categoría de INGRESO.
 */
import type { Category, TransactionType } from '../types';
import type { Aprendido, ClaseDeLinea, LineaDeExtracto, MovimientoCandidato } from './tipos';
import { mencionaComercio, normalizarTexto, tokenDeComercio } from './cotejar';

export type OrigenDeCategoria = 'historial' | 'regla' | 'respaldo';

export interface CategoriaSugerida {
  /** El nombre tal como está guardado en la cuenta destino. */
  categoria: string;
  /** Una hija de ESA categoría, o null. */
  subcategoria: string | null;
  /** De dónde salió: decide la línea que explica la sugerencia. */
  origen: OrigenDeCategoria;
  /** Todavía no existe: se crea al importar (solo 'Cargos bancarios'). */
  nueva?: true;
}

/** La categoría que se ofrece crear cuando la cuenta no tiene dónde poner lo que cobra el banco. */
export const CARGOS_BANCARIOS = 'Cargos bancarios';

/** Los nombres que ya sirven para eso, si la persona tiene alguno. */
const NOMBRES_DE_CARGOS = [CARGOS_BANCARIOS, 'Comisiones bancarias'];

/**
 * Reglas por el nombre del comercio: gana la primera que coincide Y tiene una
 * opción que existe en la cuenta. Usan los nombres que siembran 0021–0023.
 *
 * El súper y el delivery van a Alimentación SIN subcategoría: 0023 cambió las
 * de Alimentación por comidas (Desayuno, Almuerzo…), y por el comercio no se
 * sabe cuál fue.
 */
export const REGLAS_DE_CATEGORIA: [RegExp, [string, string?][]][] = [
  [/\b(SHELL|TEXACO|ESSO|SUNIX|PUMA|GULF)\b/, [['Transporte', 'Combustible']]],
  [/PEAJE|PASO RAPIDO/, [['Transporte', 'Peaje']]],
  [/OPRET|METRO|OMSA|TELEFERICO/, [['Transporte', 'Transporte público']]],
  [/UBER(?! ?EATS)|INDRIVE|CABIFY/, [['Transporte', 'Taxi / Uber']]],
  [
    /SIRENA|NACIONAL|BRAVO|JUMBO|PLAZA LAMA|PRICESMART|CARREFOUR|SUPERMERC|COLMADO|PEDIDOSYA|UBER ?EATS|RESTAUR|PIZZA|BURGER|CAFE/,
    [['Alimentación']],
  ],
  [/ALTICE|CLARO|VIVA/, [['Servicios básicos', 'Teléfono']]],
  [/EDESUR|EDENORTE|EDEESTE/, [['Servicios básicos', 'Luz']]],
  [/CAASD|CORAASAN/, [['Servicios básicos', 'Agua']]],
  [/NETFLIX|SPOTIFY|DISNEY|HBO|YOUTUBE/, [['Suscripciones', 'Streaming'], ['Entretenimiento', 'Streaming']]],
  [/ANTHROPIC|OPENAI|CAPCUT|GOOGLE|MICROSOFT|ADOBE|CANVA|APPLE\.COM/, [['Suscripciones', 'Software']]],
  [/FARMAC|CAROL/, [['Salud', 'Farmacia']]],
];

/** Lo que el banco cobra por impuestos va a Impuestos, si la cuenta lo tiene como gasto. */
const ES_IMPUESTO = /\bDGII\b|IMPUESTO/;

/** Las clases donde el nombre dice algo del gasto. En una transferencia, "Carol" es una persona. */
const CON_COMERCIO: ClaseDeLinea[] = ['purchase', 'other'];

function igual(a: string, b: string): boolean {
  return normalizarTexto(a) === normalizarTexto(b);
}

/**
 * Busca una categoría por nombre en la lista de la cuenta destino.
 *
 * La principal tiene que ser de primer nivel y de ese tipo; la sub, hija de
 * ESA principal. Los nombres de sub se repiten entre padres (Streaming,
 * Mantenimiento): resolverlas por nombre suelto daría la de otro.
 *
 * Una sub que no existe se cae sola y queda la principal: es mejor anotar
 * "Transporte" que no anotar.
 */
export function resolverCategoria(
  categorias: Category[], tipo: TransactionType, nombre: string, sub?: string | null,
): { categoria: string; subcategoria: string | null } | null {
  const padre = categorias.find(c => c.parent_id === null && c.type === tipo && igual(c.name, nombre));
  if (!padre) return null;
  const hija = sub ? categorias.find(c => c.parent_id === padre.id && igual(c.name, sub)) : undefined;
  return { categoria: padre.name, subcategoria: hija ? hija.name : null };
}

/** Si la cuenta ya tiene dónde poner lo que cobra el banco. */
export function hayCategoriaDeCargos(categorias: Category[]): boolean {
  return NOMBRES_DE_CARGOS.some(n => resolverCategoria(categorias, 'expense', n) !== null);
}

/** "Otros personal", "Otros ingreso negocio": la primera de ese tipo que empieza con 'otros'. */
export function categoriaDeRespaldo(categorias: Category[], tipo: TransactionType): string | null {
  const otras = categorias
    .filter(c => c.parent_id === null && c.type === tipo && normalizarTexto(c.name).startsWith('otros'))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return otras[0]?.name ?? null;
}

/** El primer par de la lista que existe en la cuenta. */
function primeraQueExiste(
  categorias: Category[], tipo: TransactionType, opciones: [string, string?][],
): { categoria: string; subcategoria: string | null } | null {
  for (const [nombre, sub] of opciones) {
    const r = resolverCategoria(categorias, tipo, nombre, sub);
    if (r) return r;
  }
  return null;
}

/**
 * El texto sobre el que corren las reglas: mayúsculas y sin tildes, pero con la
 * puntuación, que algunas reglas necesitan ('APPLE.COM').
 */
function textoParaReglas(l: Pick<LineaDeExtracto, 'comercio' | 'descripcion'>): string {
  return `${l.comercio} ${l.descripcion}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

function porFechaDesc(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0;
}

export interface OpcionesDeCategoria {
  /** Quien importa: en el primer import se aprende de SUS movimientos, no de los de la pareja. */
  yo?: string;
  /** El interruptor "Crear «Cargos bancarios»": si está prendido y no existe, se sugiere la nueva. */
  crearCargosBancarios?: boolean;
}

/**
 * La categoría para una línea que se va a anotar como `tipo`, o null.
 *
 * - `categorias`: las de la cuenta DESTINO (las de otra cuenta no sirven).
 * - `aprendido`: lo de importaciones anteriores, con la categoría que tiene HOY
 *   su movimiento. Gana lo más reciente de ese `matchKey`: si la persona
 *   recategorizó después, eso es lo que enseña.
 * - `movimientos`: lo ya anotado en las fechas del estado. En la primera
 *   importación no hay nada aprendido; lo anotado a mano con el nombre del
 *   comercio en la descripción es lo mejor que hay.
 */
export function categoriaPara(
  linea: Pick<LineaDeExtracto, 'clase' | 'comercio' | 'descripcion' | 'matchKey'>,
  tipo: TransactionType,
  categorias: Category[],
  aprendido: Aprendido[],
  movimientos: MovimientoCandidato[],
  op: OpcionesDeCategoria = {},
): CategoriaSugerida | null {
  // 1) Lo que se hizo antes con este mismo comercio o contraparte.
  if (linea.matchKey) {
    const previas = aprendido
      .filter(a => a.match_key === linea.matchKey && a.type === tipo && a.category)
      .sort((a, b) => porFechaDesc(a.created_at, b.created_at));
    for (const a of previas) {
      const r = resolverCategoria(categorias, tipo, a.category as string, a.subcategory);
      if (r) return { ...r, origen: 'historial' };
    }
  }
  const token = tokenDeComercio(linea.matchKey);
  if (token && op.yo) {
    const propios = movimientos
      .filter(t => t.author_id === op.yo && t.type === tipo && mencionaComercio(t.description, token, t))
      .sort((a, b) => porFechaDesc(a.date, b.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const t of propios) {
      const r = resolverCategoria(categorias, tipo, t.category, t.subcategory);
      if (r) return { ...r, origen: 'historial' };
    }
  }

  // 2) Las reglas.
  const texto = textoParaReglas(linea);
  if (linea.clase === 'fee' && tipo === 'expense') {
    const opciones: [string, string?][] = ES_IMPUESTO.test(texto) ? [['Impuestos']] : [];
    opciones.push(...NOMBRES_DE_CARGOS.map(n => [n] as [string]));
    const r = primeraQueExiste(categorias, tipo, opciones);
    if (r) return { ...r, origen: 'regla' };
    if (op.crearCargosBancarios) {
      return { categoria: CARGOS_BANCARIOS, subcategoria: null, origen: 'regla', nueva: true };
    }
  } else if (linea.clase === 'interest' && tipo === 'income') {
    const r = primeraQueExiste(categorias, tipo, [['Inversiones', 'Intereses']]);
    if (r) return { ...r, origen: 'regla' };
  } else if (CON_COMERCIO.includes(linea.clase)) {
    for (const [patron, opciones] of REGLAS_DE_CATEGORIA) {
      if (!patron.test(texto)) continue;
      const r = primeraQueExiste(categorias, tipo, opciones);
      if (r) return { ...r, origen: 'regla' };
    }
  }

  // 3) El genérico de ese tipo.
  const respaldo = categoriaDeRespaldo(categorias, tipo);
  if (respaldo) return { categoria: respaldo, subcategoria: null, origen: 'respaldo' };
  return null;
}
