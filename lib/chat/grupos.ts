/**
 * Cuándo el agente contesta en un grupo, y cuándo se queda callado.
 *
 * En un chat privado todo mensaje va dirigido al bot. En un grupo no: la
 * mayoría son entre las personas. Sin filtro, el bot contesta a cada "jaja" y
 * cada "ya voy" —una llamada al modelo por mensaje— y vuelve el grupo
 * inusable.
 *
 * El criterio no es "parece un gasto" a secas, porque también hay preguntas
 * ("¿cuánto llevamos?") y respuestas a algo que el bot preguntó. Es: hablale al
 * bot, o hablá de plata.
 */
import { normalizar } from './pending';

/**
 * Palabras que ponen el mensaje en terreno del bot aunque no traiga números:
 * preguntas por el estado, órdenes de anotar, o el vocabulario de la app.
 */
const PALABRAS_DE_PLATA = [
  'gaste', 'gasto', 'gastos', 'gastamos', 'pague', 'pago', 'pagamos', 'pagué',
  'compre', 'compra', 'compramos', 'cobre', 'cobro', 'cobramos',
  'anota', 'anotalo', 'anotar', 'apunta', 'apuntalo', 'apuntar', 'registra',
  'presupuesto', 'presupuestos', 'balance', 'saldo', 'resumen', 'cuenta',
  'deuda', 'deudas', 'cuota', 'cuotas', 'tarjeta', 'efectivo', 'transferencia',
  'ingreso', 'ingresos', 'sueldo', 'factura', 'recibo',
  'cuanto', 'cuantos', 'cuanta', 'cuantas',
];

/** Monedas y unidades que delatan un monto aunque el número vaya pegado. */
const RE_MONTO = /\d/;

/** Cómo se nombra al bot para llamarlo a propósito. */
const RE_MENCION = /(^|\s)@/;

export interface SeñalesDeGrupo {
  texto: string;
  /** La persona tiene algo esperando confirmación: su "sí" va dirigido al bot. */
  hayPendiente: boolean;
  /** El mensaje responde a uno del bot, o lo menciona. */
  interpelaAlBot?: boolean;
  /** Vino de una nota de voz o una foto: mandarle un audio al grupo y esperar
   *  que el bot lo lea es intención suficiente. */
  esMedia?: boolean;
}

/**
 * ¿Este mensaje de grupo es para el bot?
 *
 * Ante la duda contesta que sí: un falso positivo es un mensaje de más, un
 * falso negativo es un gasto que no se anotó.
 */
export function leDirigeLaPalabra(s: SeñalesDeGrupo): boolean {
  if (s.hayPendiente) return true;
  if (s.interpelaAlBot) return true;
  if (s.esMedia) return true;
  if (RE_MENCION.test(s.texto)) return true;
  if (RE_MONTO.test(s.texto)) return true;

  const palabras = new Set(normalizar(s.texto).split(' '));
  return PALABRAS_DE_PLATA.some(p => palabras.has(p));
}
