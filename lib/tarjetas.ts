/**
 * La cuenta de la tarjeta de crédito: ciclo, saldo y cuánto queda de límite.
 *
 * Vive aparte de `format.ts` porque no es formato sino aritmética de calendario,
 * y aparte de `db.ts` porque no toca la base: son funciones puras que corren
 * igual en el navegador, en la ruta de API y en el cron de avisos. Que el cron
 * y la pantalla usen el MISMO código es la única forma de que el aviso diga la
 * misma fecha que se ve en la app.
 */

import { Card, CardBalance, CardCycle } from './types';

// ─── Días del mes ─────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** Cuántos días tiene el mes `m0` (base 0) de `y`. Contempla los bisiestos. */
function ultimoDiaDelMes(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

/**
 * La fecha del día `dia` en el mes `m0` (base 0) de `y`, recortada al último
 * día si el mes es más corto.
 *
 * Sin el recorte, "corte el 31" no existiría en febrero. Los bancos lo resuelven
 * igual: el corte se corre al último día del mes.
 *
 * `m0` puede quedar fuera de 0–11: Date.UTC(2026, 12, 1) es enero de 2027, y de
 * eso dependen las cuentas de "el mes que viene" y "el mes pasado".
 */
function fechaDelMes(y: number, m0: number, dia: number): string {
  // El mes real después de normalizar el desborde, para recortar contra ÉL y no
  // contra el mes de partida.
  const normal = new Date(Date.UTC(y, m0, 1));
  const ay = normal.getUTCFullYear();
  const am = normal.getUTCMonth();
  const d = Math.min(dia, ultimoDiaDelMes(ay, am));
  return `${ay}-${pad(am + 1)}-${pad(d)}`;
}

/** Suma días a un YYYY-MM-DD. Sirve para "tres días antes". */
export function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + dias));
  return `${f.getUTCFullYear()}-${pad(f.getUTCMonth() + 1)}-${pad(f.getUTCDate())}`;
}

/**
 * Cuántos días faltan de `desde` hasta `hasta`. Negativo si ya pasó.
 *
 * Las dos fechas son días de calendario, no instantes: se restan en UTC para
 * que el horario de verano no meta un día de más.
 */
export function diasEntre(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split('-').map(Number);
  const [y2, m2, d2] = hasta.split('-').map(Number);
  const ms = Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1);
  return Math.round(ms / 86400000);
}

// ─── El ciclo ─────────────────────────────────────────────────────────────────

/**
 * La próxima fecha de corte contando desde `hoy`, inclusive.
 *
 * Inclusive a propósito: el estado de cuenta cierra AL FINAL del día de corte,
 * así que lo que se compre ese mismo día todavía entra. Si `hoy` es el corte,
 * el próximo corte es hoy.
 */
export function proximoCorte(hoy: string, diaDeCorte: number): string {
  const [y, m] = hoy.split('-').map(Number);
  const esteMes = fechaDelMes(y, m - 1, diaDeCorte);
  return esteMes >= hoy ? esteMes : fechaDelMes(y, m, diaDeCorte);
}

/** El corte anterior a `hoy`, exclusivo: si hoy es el corte, devuelve el pasado. */
export function corteAnterior(hoy: string, diaDeCorte: number): string {
  const [y, m] = hoy.split('-').map(Number);
  const esteMes = fechaDelMes(y, m - 1, diaDeCorte);
  return esteMes < hoy ? esteMes : fechaDelMes(y, m - 2, diaDeCorte);
}

/**
 * La fecha de pago que le corresponde a un corte.
 *
 * Si el día de pago cae después del de corte, el pago es del mismo mes (corte
 * el 5, pago el 25). Si cae antes o el mismo día, es del mes siguiente, que es
 * lo habitual acá: corte el 25, pago el 10.
 *
 * La comparación va con los días CONFIGURADOS, no con los recortados: con corte
 * 31 y pago 15 en febrero, los dos recortados darían 28 y 15, y comparar esos
 * mandaría el pago al mismo mes que el corte.
 */
export function pagoDelCorte(corte: string, diaDeCorte: number, diaDePago: number): string {
  const [y, m] = corte.split('-').map(Number);
  const mesSiguiente = diaDePago > diaDeCorte ? 0 : 1;
  return fechaDelMes(y, m - 1 + mesSiguiente, diaDePago);
}

/**
 * La próxima fecha de pago contando desde `hoy`, inclusive.
 *
 * Es la del último corte cerrado mientras no se haya vencido; una vez que pasó,
 * la que viene es la del corte que está por cerrar.
 */
export function proximoPago(hoy: string, diaDeCorte: number, diaDePago: number): string {
  const delAnterior = pagoDelCorte(corteAnterior(hoy, diaDeCorte), diaDeCorte, diaDePago);
  if (delAnterior >= hoy) return delAnterior;
  return pagoDelCorte(proximoCorte(hoy, diaDeCorte), diaDeCorte, diaDePago);
}

/**
 * Si la tarjeta tiene ciclo configurado, todas sus fechas de una vez.
 *
 * Devuelve null cuando falta el día de corte o el de pago: sin los dos no hay
 * ciclo, y la pantalla tiene que poder mostrar la tarjeta igual en vez de
 * romperse. Configurar las fechas es opcional.
 */
export function cicloDeTarjeta(card: Card, hoy: string): CardCycle | null {
  const { statement_day: corte, due_day: pago } = card;
  if (!corte || !pago) return null;

  const anterior = corteAnterior(hoy, corte);
  const proximo = proximoCorte(hoy, corte);
  const vence = proximoPago(hoy, corte, pago);

  return {
    lastStatement: anterior,
    nextStatement: proximo,
    nextDue: vence,
    daysToStatement: diasEntre(hoy, proximo),
    daysToDue: diasEntre(hoy, vence),
  };
}

/**
 * Desde qué fecha se cuentan las compras del ciclo en curso.
 *
 * Sin ciclo configurado devuelve una fecha vieja: así TODO lo comprado cuenta
 * como "del ciclo", el saldo facturado da cero y la pantalla no inventa una
 * fecha de pago que el usuario nunca puso.
 */
export function desdeElUltimoCorte(card: Card, hoy: string): string {
  const ciclo = cicloDeTarjeta(card, hoy);
  return ciclo ? ciclo.lastStatement : '1900-01-01';
}

// ─── El saldo ─────────────────────────────────────────────────────────────────

/** Los totales crudos que devuelve `card_balances`, antes de interpretarlos. */
export interface TotalesDeTarjeta {
  charged: number;
  credited: number;
  paid: number;
  cycleCharged: number;
}

/**
 * Arma el estado de cuenta a partir de los totales de la base.
 *
 * `aPagar` sale de restarle al saldo lo del ciclo en curso, y no de sumar las
 * compras de un rango de fechas. La diferencia importa: un pago hecho después
 * del corte baja el saldo, y con la resta baja también lo que falta pagar,
 * mientras que sumando compras habría que andar decidiendo a qué estado de
 * cuenta se le imputa cada pago.
 */
export function calcularSaldo(card: Card, totales: TotalesDeTarjeta, hoy: string): CardBalance {
  const saldo = card.opening_balance + totales.charged - totales.credited - totales.paid;
  const cycleCharged = totales.cycleCharged;

  const limite = card.credit_limit;
  // Un saldo a favor no debe mostrar disponible por encima del cupo ni un uso
  // negativo: la barra quedaría al revés.
  const consumido = Math.max(saldo, 0);

  return {
    charged: totales.charged,
    credited: totales.credited,
    paid: totales.paid,
    saldo,
    cycleCharged,
    aPagar: Math.max(saldo - cycleCharged, 0),
    disponible: limite != null ? limite - consumido : null,
    usoDelLimite: limite != null && limite > 0 ? (consumido / limite) * 100 : null,
    ciclo: cicloDeTarjeta(card, hoy),
  };
}

// ─── Avisos ───────────────────────────────────────────────────────────────────

/** Con cuántos días de anticipación se empieza a avisar. */
export const DIAS_DE_AVISO = 3;

/** Un vencimiento que se viene: el corte o el pago de una tarjeta. */
export interface AvisoDeTarjeta {
  card: Card;
  /** 'statement' = fecha de corte, 'due' = fecha de pago. */
  kind: 'statement' | 'due';
  /** El día del vencimiento. */
  date: string;
  /** Cuántos días faltan. 0 = es hoy. */
  daysBefore: number;
  balance: CardBalance;
}

/**
 * Los cortes y pagos que caen dentro de los próximos `dias`.
 *
 * La usan la pantalla y el cron de avisos, y esa es la razón de que sea una
 * función pura: si el aviso de WhatsApp saliera de una cuenta y el cartel de la
 * app de otra, tarde o temprano dirían fechas distintas.
 *
 * Salteá las que tienen los avisos apagados: es el "no me molestes con esta"
 * que eligió el usuario, y vale tanto para el mensaje como para el cartel.
 */
export function avisosDeTarjetas(
  cards: Card[],
  saldos: Map<string, CardBalance>,
  dias: number = DIAS_DE_AVISO,
): AvisoDeTarjeta[] {
  const avisos: AvisoDeTarjeta[] = [];

  for (const card of cards) {
    if (card.archived || !card.alerts) continue;
    const balance = saldos.get(card.id);
    if (!balance?.ciclo) continue;

    const { ciclo } = balance;
    if (ciclo.daysToStatement >= 0 && ciclo.daysToStatement <= dias) {
      avisos.push({
        card, kind: 'statement', date: ciclo.nextStatement,
        daysBefore: ciclo.daysToStatement, balance,
      });
    }
    if (ciclo.daysToDue >= 0 && ciclo.daysToDue <= dias) {
      avisos.push({
        card, kind: 'due', date: ciclo.nextDue, daysBefore: ciclo.daysToDue, balance,
      });
    }
  }

  // Lo más inminente primero, y ante el mismo día el pago antes que el corte:
  // dejar pasar una fecha de pago cuesta plata, un corte no.
  return avisos.sort((a, b) =>
    a.daysBefore - b.daysBefore || (a.kind === 'due' ? -1 : 1));
}

/** "es hoy" / "es mañana" / "faltan 3 días". */
export function cuandoVence(dias: number): string {
  if (dias <= 0) return 'es hoy';
  if (dias === 1) return 'es mañana';
  return `faltan ${dias} días`;
}
