/**
 * Las fechas del estado de cuenta.
 *
 * El banco imprime los movimientos como '25AGO', sin año, y el corte como
 * '22 de septiembre de 2026'. El año de cada movimiento sale del corte. Todo
 * es texto y `Date.UTC`: nada de `Intl` ni de la zona horaria del servidor, que
 * en Vercel es UTC y en la Mac del dueño no.
 */
import { diasEntre, sumarDias } from '../tarjetas';

/**
 * Español e inglés: el mismo estado trae '25AGO' en las líneas y '24AUG' en el
 * renglón de BALANCE ANTERIOR. Las dos formas son el mismo mes.
 */
const MESES_CORTOS: Record<string, number> = {
  ENE: 1, JAN: 1, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AGO: 8, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12, DEC: 12,
};

export const FECHA_CORTA = /^(\d{2})(ENE|JAN|FEB|MAR|ABR|APR|MAY|JUN|JUL|AGO|AUG|SEP|OCT|NOV|DIC|DEC)$/;

const MESES_LARGOS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Arma el ISO solo si el día existe: un '31SEP' leído mal no se corre al 1 de octubre. */
function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const f = new Date(Date.UTC(y, m - 1, d));
  if (f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** ¿Es un YYYY-MM-DD que existe en el calendario? */
export function esFechaISO(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return !!m && iso(Number(m[1]), Number(m[2]), Number(m[3])) === s;
}

/**
 * '25AGO' con el corte '2026-09-22' → '2026-08-25'.
 *
 * El año es el del corte, menos uno si el mes viene DESPUÉS del mes del corte:
 * un estado que corta el 5 de enero trae movimientos del 28DIC, y esos son del
 * año anterior. Un estado mensual nunca abarca más de un cambio de año.
 */
export function fechaCorta(ddMMM: string, corteISO: string): string | null {
  const m = FECHA_CORTA.exec(ddMMM.trim().toUpperCase());
  if (!m || !esFechaISO(corteISO)) return null;
  const mes = MESES_CORTOS[m[2]];
  const anioCorte = Number(corteISO.slice(0, 4));
  const mesCorte = Number(corteISO.slice(5, 7));
  return iso(mes > mesCorte ? anioCorte - 1 : anioCorte, mes, Number(m[1]));
}

/** '22 de septiembre de 2026' → '2026-09-22'. Tolera mayúsculas y espacios de más. */
export function fechaLarga(texto: string): string | null {
  const m = /(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de|del)\s+(\d{4})/i.exec(texto);
  if (!m) return null;
  const mes = MESES_LARGOS[m[2].toLowerCase()];
  if (!mes) return null;
  return iso(Number(m[3]), mes, Number(m[1]));
}

export { diasEntre, sumarDias };
