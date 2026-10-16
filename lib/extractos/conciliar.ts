/**
 * Cuadrar lo leído contra los números del propio banco, al centavo.
 *
 * Es la única prueba de que el lector no se comió una línea, no la duplicó y
 * no le dio vuelta el signo. Si algo no cuadra no se devuelve NINGUNA línea:
 * importar un estado a medias, o "casi" bien, anota montos equivocados que
 * nadie va a revisar después. Un cambio de diseño del banco se arregla en el
 * lector, no se adivina acá.
 *
 * Todo en centavos enteros: la suma de 68 decimales no da exacta, la de 68
 * enteros sí.
 */
import { diasEntre, esFechaISO } from './fechas';
import type { LecturaCruda, MotivoNoCuadra } from './tipos';

export type Conciliacion = { ok: true } | { ok: false; motivo: MotivoNoCuadra; fecha?: string };

/** Cuánto antes de asentarse puede haber pasado un movimiento. Un mes y un día. */
const DIAS_DE_ATRASO = 31;

export function conciliar(c: LecturaCruda): Conciliacion {
  const r = c.resumen;
  const enteros = [c.saldoInicialCentavos, c.saldoFinalCentavos, r.saldoAnteriorCentavos,
    r.saldoAlCorteCentavos, r.creditos.centavos, r.debitos.centavos, r.creditos.n, r.debitos.n];
  if (!enteros.every(Number.isSafeInteger)) return { ok: false, motivo: 'apertura' };

  // El renglón BALANCE ANTERIOR de la tabla contra el del resumen de arriba.
  if (c.saldoInicialCentavos !== r.saldoAnteriorCentavos) return { ok: false, motivo: 'apertura' };

  let saldo = c.saldoInicialCentavos;
  let previa = '';
  let creditos = 0, debitos = 0, sumaCreditos = 0, sumaDebitos = 0;
  for (const l of c.lineas) {
    const fecha = esFechaISO(l.asentada) ? l.asentada : undefined;
    // Un monto en cero es como el lector marca una línea que no pudo leer sin
    // adivinar: dos montos en el mismo renglón, o un menos en la columna de
    // créditos. Va primero porque es la causa; el saldo roto sería la consecuencia.
    if (!Number.isSafeInteger(l.centavos) || l.centavos === 0) return { ok: false, motivo: 'signo', fecha };

    if (!fecha || !esFechaISO(l.fecha)) return { ok: false, motivo: 'fechas', fecha };
    // Las fechas de entrada no van para atrás ni pasan del corte: si lo hacen,
    // el orden de las líneas (y con él la cadena de saldos) no es el del banco.
    if (fecha < previa || fecha > c.corte) return { ok: false, motivo: 'fechas', fecha };
    // La transacción pasa el día que se asienta o antes, nunca después.
    const atraso = diasEntre(l.fecha, fecha);
    if (atraso < 0 || atraso > DIAS_DE_ATRASO) return { ok: false, motivo: 'fechas', fecha };
    previa = fecha;

    // Cada renglón, no solo el último: dos errores que se compensan dejan bien
    // el saldo final y mal dos líneas.
    saldo += l.centavos;
    if (!Number.isSafeInteger(l.saldoCentavos) || saldo !== l.saldoCentavos) {
      return { ok: false, motivo: 'saldo', fecha };
    }

    if (l.centavos > 0) { creditos++; sumaCreditos += l.centavos; }
    else { debitos++; sumaDebitos -= l.centavos; }
  }

  if (saldo !== c.saldoFinalCentavos || c.saldoFinalCentavos !== r.saldoAlCorteCentavos) {
    return { ok: false, motivo: 'cierre' };
  }
  if (creditos !== r.creditos.n || debitos !== r.debitos.n) return { ok: false, motivo: 'conteo' };
  // Un estado con intereses que no entren en estos totales cae acá: no hay un
  // ejemplo todavía para saber cómo los imprime el banco, y es mejor frenarlo
  // que adivinarlo.
  if (sumaCreditos !== r.creditos.centavos || sumaDebitos !== r.debitos.centavos) {
    return { ok: false, motivo: 'totales' };
  }
  return { ok: true };
}
