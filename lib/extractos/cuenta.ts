/**
 * Qué cuenta de la Billetera es la del estado de cuenta.
 *
 * Por tipo (ahorro o corriente) y últimos 4, nada más. Nunca por nombre:
 * `buscarCardPorTexto` busca pedazos del nombre y "Popular" encontraría la
 * "Visa Popular", que es una tarjeta de crédito y otra plata.
 *
 * La función SQL vuelve a exigir lo mismo (CUENTA_INVALIDA): una cuenta mía,
 * de ahorro o corriente, con esos últimos 4. Lo de acá es para que la persona
 * vea antes de tocar Importar qué cuenta se va a usar, y no un error después.
 */
import type { Card, CardKind, NuevaCard } from '../types';
import type { ExtractoLeido } from './tipos';
import { normalizarTexto } from './cotejar';
import { nombreDelBanco } from './textos-plan';

/**
 * - `una`: la cuenta es esa (puede estar archivada: igual sirve).
 * - `completar`: la pidió la persona (?card=) y no tiene últimos 4; se le guardan al importar.
 * - `varias`: más de una cuenta empata; la persona elige en el resumen.
 * - `ninguna`: no está en la Billetera; se propone crearla al importar.
 * - `bloqueada`: la pidió la persona y es otra cuenta. No se importa.
 */
export type CuentaElegida =
  | { tipo: 'una'; card: Card }
  | { tipo: 'completar'; card: Card }
  | { tipo: 'varias'; candidatas: Card[] }
  | { tipo: 'ninguna'; propuesta: NuevaCard }
  | { tipo: 'bloqueada'; card: Card };

const DE_BANCO: CardKind[] = ['savings', 'checking'];

/** Cómo se reconoce el emisor de cada banco en lo que la persona escribió. */
const EMISORES: Record<string, RegExp> = {
  popular: /popular|bpd/,
};

/** Las palabras chicas no se capitalizan: 'Cuenta de Ahorro', no 'Cuenta De Ahorro'. */
const MENORES = new Set(['de', 'del', 'la', 'el', 'y', 'en', 'a']);

/** 'CUENTA DIGITAL LIBRE' → 'Cuenta Digital Libre'. */
export function nombreDeProducto(producto: string): string {
  return producto
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) => (i > 0 && MENORES.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

function porTexto(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Se queda con las que cumplen, si alguna cumple. Es el desempate en cascada. */
function preferir(cards: Card[], cumple: (c: Card) => boolean): Card[] {
  const si = cards.filter(cumple);
  return si.length > 0 ? si : cards;
}

/**
 * Elige la cuenta del estado.
 *
 * `cards` son TODAS, archivadas incluidas: una cuenta archivada sigue siendo la
 * del estado, y crear otra igual duplicaría la cuenta en la Billetera.
 *
 * `pedida` es la cuenta desde la que se abrió la importación (?card=). Si es
 * otra cuenta, se bloquea en vez de usar la que corresponde por las suyas: la
 * persona dijo cuál esperaba, y que no coincida casi siempre es haber bajado
 * el PDF equivocado.
 */
export function elegirCuenta(
  cards: Card[],
  extracto: Pick<ExtractoLeido, 'banco' | 'producto' | 'tipoDeCuenta' | 'ultimos4'>,
  pedida?: string | null,
): CuentaElegida {
  const deseada = pedida ? cards.find(c => c.id === pedida) : undefined;
  if (deseada) {
    if (!DE_BANCO.includes(deseada.kind)) return { tipo: 'bloqueada', card: deseada };
    if (!deseada.last4) return { tipo: 'completar', card: deseada };
    if (deseada.last4 !== extracto.ultimos4) return { tipo: 'bloqueada', card: deseada };
    return { tipo: 'una', card: deseada };
  }

  let candidatas = cards
    .filter(c => DE_BANCO.includes(c.kind) && c.last4 === extracto.ultimos4)
    .sort((a, b) => porTexto(a.name, b.name) || porTexto(a.id, b.id));
  const emisor = EMISORES[extracto.banco];
  if (emisor) candidatas = preferir(candidatas, c => emisor.test(normalizarTexto(c.issuer)));
  candidatas = preferir(candidatas, c => c.kind === extracto.tipoDeCuenta);
  candidatas = preferir(candidatas, c => !c.archived);

  if (candidatas.length === 1) return { tipo: 'una', card: candidatas[0] };
  if (candidatas.length > 1) return { tipo: 'varias', candidatas };

  // No está: se propone. Con el mismo nombre que otra, la de la Billetera
  // rechazaría el alta; con los últimos 4 al final ya no choca.
  const banco = nombreDelBanco(extracto.banco);
  const base = nombreDeProducto(extracto.producto) || `Cuenta ${banco}`;
  const choca = cards.some(c => normalizarTexto(c.name) === normalizarTexto(base));
  return {
    tipo: 'ninguna',
    propuesta: {
      name: choca ? `${base} ··${extracto.ultimos4}` : base,
      kind: extracto.tipoDeCuenta,
      last4: extracto.ultimos4,
      issuer: banco,
      color: 'blue',
    },
  };
}

/** La cuenta que se va a usar, si ya está decidida. */
export function cardDeLaCuenta(c: CuentaElegida): Card | null {
  return c.tipo === 'una' || c.tipo === 'completar' ? c.card : null;
}

/**
 * Las otras cuentas que la persona puede elegir en lugar de la propuesta: las
 * de banco sin últimos 4 (se le guardan al importar) o con los mismos.
 */
export function cuentasElegibles(cards: Card[], ultimos4: string): Card[] {
  return cards
    .filter(c => DE_BANCO.includes(c.kind) && (c.last4 === '' || c.last4 === ultimos4))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || porTexto(a.name, b.name) || porTexto(a.id, b.id));
}
