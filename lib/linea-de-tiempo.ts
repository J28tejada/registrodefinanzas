/**
 * Cuántos días hay para pagar una compra con la tarjeta, según el día en que se
 * hace.
 *
 * Es la cuenta que uno hace de cabeza y casi siempre mal: lo que se compra el
 * día después del corte no se paga hasta el vencimiento del corte SIGUIENTE, y
 * ahí la tarjeta da cerca de cincuenta días; lo que se compra el día del corte
 * se paga en veinte. La barra de la pantalla dibuja ese ciclo entero para que
 * se vea de un vistazo cuál de las dos cosas va a pasar.
 *
 * No hay aritmética de calendario nueva: todo sale de `tarjetas.ts`, que es lo
 * que usan el estado de cuenta y el cron de avisos. Si esto contara por su
 * lado, la barra podría decir un vencimiento y el aviso de WhatsApp otro.
 *
 * Puro y compartido: lo usan las dos apps, y los textos también viven acá para
 * que la web y el teléfono digan exactamente lo mismo.
 */
import {
  corteAnterior, diasEntre, pagoDelCorte, proximoCorte, proximoPago, sumarDias,
} from './tarjetas';
import { fechaCorta } from './extractos/textos-plan';

// ─── Una compra ───────────────────────────────────────────────────────────────

/** Adónde va a parar una compra: en qué corte entra y cuándo se paga. */
export interface PlazoDePago {
  /** El corte en el que entra. */
  corte: string;
  /** El vencimiento de ese corte. */
  pago: string;
  /** Días desde la compra hasta el vencimiento. 0 = se paga el mismo día. */
  dias: number;
}

/**
 * El plazo de una compra hecha el día `compra`.
 *
 * El corte es inclusive, como en `proximoCorte`: lo que se compra el día del
 * corte todavía entra en ese estado de cuenta, y por eso es el día que MENOS
 * plazo da, no el que más.
 */
export function diasParaPagar(compra: string, diaDeCorte: number, diaDePago: number): PlazoDePago {
  const corte = proximoCorte(compra, diaDeCorte);
  const pago = pagoDelCorte(corte, diaDeCorte, diaDePago);
  return { corte, pago, dias: diasEntre(compra, pago) };
}

// ─── El ciclo en curso ────────────────────────────────────────────────────────

/**
 * El ciclo de compras en curso y su vencimiento, listo para dibujar.
 *
 * La barra va del primer día del ciclo al vencimiento, y tiene dos tramos: los
 * días en que se compra (hasta el corte) y los de gracia (del corte al pago).
 * Las posiciones van en fracciones de 0 a 1 contadas en días, y no en píxeles:
 * así las dos apps dibujan la misma barra con los mismos números.
 */
export interface LineaDeTiempo {
  diaDeCorte: number;
  diaDePago: number;
  hoy: string;
  /** El primer día del ciclo: el que sigue al corte anterior. */
  inicio: string;
  /** El corte del ciclo. `hoy` siempre cae entre `inicio` y este, inclusive. */
  corte: string;
  /** El vencimiento de este corte. Es el mismo para cualquier día del ciclo. */
  pago: string;
  /** Cuántos días de compra tiene el ciclo, `inicio` y `corte` incluidos. */
  diasDelCiclo: number;
  /** Comprando el primer día del ciclo: lo más que da la tarjeta. */
  maximo: number;
  /** Comprando el día del corte: lo menos. */
  minimo: number;
  /** Dónde cae el corte en la barra, entre 0 (inicio) y 1 (pago). */
  posicionDelCorte: number;
}

/**
 * El ciclo al que pertenece `hoy`: todos los días cuyas compras entran en el
 * próximo corte.
 *
 * El inicio sale del corte anterior al PRÓXIMO corte y no del anterior a hoy:
 * el día del corte, el anterior a hoy es el del mes pasado (es exclusivo) y el
 * próximo es hoy mismo, así que partir del próximo es la única forma de que
 * los dos extremos sean del mismo ciclo sin un caso aparte.
 */
export function lineaDeTiempo(hoy: string, diaDeCorte: number, diaDePago: number): LineaDeTiempo {
  const corte = proximoCorte(hoy, diaDeCorte);
  const inicio = sumarDias(corteAnterior(corte, diaDeCorte), 1);
  const pago = pagoDelCorte(corte, diaDeCorte, diaDePago);
  // Nunca es cero: el ciclo solo ya tiene 28 días como mínimo.
  const maximo = diasEntre(inicio, pago);
  return {
    diaDeCorte, diaDePago, hoy, inicio, corte, pago,
    diasDelCiclo: diasEntre(inicio, corte) + 1,
    maximo,
    minimo: diasEntre(corte, pago),
    posicionDelCorte: diasEntre(inicio, corte) / maximo,
  };
}

/** Si una fecha es un día de compra de este ciclo. */
export function dentroDelCiclo(linea: LineaDeTiempo, fecha: string): boolean {
  return fecha >= linea.inicio && fecha <= linea.corte;
}

/** Qué día del ciclo es una fecha: 0 el primero, `diasDelCiclo - 1` el corte. */
export function indiceDeCompra(linea: LineaDeTiempo, fecha: string): number {
  return Math.min(Math.max(diasEntre(linea.inicio, fecha), 0), linea.diasDelCiclo - 1);
}

/**
 * La fecha del día `indice` del ciclo, sin salirse de él.
 *
 * Mover la compra nunca saca del ciclo en curso: cada día del mes aparece una
 * sola vez en un ciclo, así que "si la uso el día tal" siempre tiene una
 * respuesta adentro de esta barra.
 */
export function compraDelIndice(linea: LineaDeTiempo, indice: number): string {
  const i = Math.min(Math.max(Math.round(indice), 0), linea.diasDelCiclo - 1);
  return sumarDias(linea.inicio, i);
}

/** Dónde se dibuja una fecha en la barra, entre 0 y 1. */
export function posicionDe(linea: LineaDeTiempo, fecha: string): number {
  return Math.min(Math.max(diasEntre(linea.inicio, fecha) / linea.maximo, 0), 1);
}

/**
 * El día de compra que corresponde a un punto de la barra: lo que se elige al
 * tocarla o al arrastrar.
 *
 * Redondea al día más cercano para que el dedo caiga en días enteros, y se
 * queda en el ciclo: tocar el tramo de gracia elige el corte, que es el último
 * día en que todavía se puede comprar para este vencimiento.
 */
export function compraEnLaPosicion(linea: LineaDeTiempo, fraccion: number): string {
  return compraDelIndice(linea, fraccion * linea.maximo);
}

// ─── Los textos ───────────────────────────────────────────────────────────────

/** Lo que no cambia con las fechas. */
export const TEXTOS_DE_LA_LINEA = {
  titulo: 'Días para pagar',
  volverAHoy: 'Hoy',
  volverAHoyAccesible: 'Volver a hoy',
  barraAccesible: 'Día de la compra',
  /*
   * El plazo de gracia vale solo si se paga el total del estado de cuenta. Si
   * se paga el mínimo, el banco cobra intereses y estos días dejan de ser
   * gratis: decirlo al lado del número es lo honesto.
   */
  nota: 'Vale si pagás el total del estado de cuenta a tiempo; si no, el banco cobra intereses.',
};

/*
 * Espacio duro entre el número y lo que cuenta: "1 / día" o "2 / dic" partidos
 * en dos renglones se leen como dos cosas sueltas.
 */
const DURO = '\u00a0';

/** "1 día", "16 días". */
function enDias(n: number): string {
  return n === 1 ? `1${DURO}día` : `${n}${DURO}días`;
}

/**
 * '10 ene'. Con la tabla de `textos-plan` y no con Intl: el mes abreviado
 * cambia entre motores ('sept' en unos, 'sep' en otros) y las dos apps tienen
 * que decir lo mismo.
 */
function fecha(iso: string): string {
  return fechaCorta(iso).replace(' ', DURO);
}

/**
 * "hoy", "mañana", "el 3 dic". Y el verbo en pasado si ya pasó: una compra del
 * principio del ciclo se mira para saber cuándo se paga lo que YA se compró.
 */
function cuando(compra: string, hoy: string): string {
  const diferencia = diasEntre(hoy, compra);
  if (diferencia === 0) return 'Si la usás hoy';
  if (diferencia === 1) return 'Si la usás mañana';
  if (diferencia === -1) return 'Si la usaste ayer';
  return diferencia > 0 ? `Si la usás el ${fecha(compra)}` : `Si la usaste el ${fecha(compra)}`;
}

/**
 * El consejo de abajo: cuándo conviene usarla. Depende de hoy y no de la compra
 * elegida, así que no se mueve mientras se arrastra.
 *
 * Nombra el PRÓXIMO día después del corte, con su número exacto, y no el
 * primero de la barra: ese casi siempre ya pasó, y lo que sirve es saber para
 * cuándo dejar una compra grande. Sus días son los del ciclo que viene, que
 * pueden no ser los de esta barra porque los meses no miden lo mismo.
 *
 * Por eso mismo no siempre conviene esperar: si el ciclo que viene pasa por
 * febrero, el día después del corte puede dar menos que hoy (con corte 25 y
 * pago 10, el 27 dic da 45 y el 26 ene, 43). Ahí se dice que hoy da más, en
 * vez de mandar a esperar un mes para perder días.
 */
function consejo(linea: LineaDeTiempo): string {
  const manana = sumarDias(linea.corte, 1);
  const diasDelSiguiente = diasParaPagar(manana, linea.diaDeCorte, linea.diaDePago).dias;
  const delSiguiente = enDias(diasDelSiguiente);
  const deHoy = diasParaPagar(linea.hoy, linea.diaDeCorte, linea.diaDePago).dias;
  // Cero pasa cuando el pago y el corte, recortados a un mes corto, caen el
  // mismo día (corte 30, pago 31, en abril): no hay gracia que contar.
  const sinGracia = linea.minimo === 0;

  if (linea.hoy === linea.inicio) {
    return 'Hoy es el mejor día para usarla: el corte fue ayer, y lo que compres hoy entra recién en el próximo.';
  }
  // El día del corte es cuando más rinde esperar: un día de diferencia suma
  // un mes entero de plazo. "60 días en vez de 30", con la unidad una vez.
  if (linea.hoy === linea.corte) {
    return `Hoy es el corte: si esperás a mañana, tenés ${delSiguiente} en vez de ` +
      `${sinGracia ? 'ninguno' : linea.minimo}.`;
  }
  const delCorte = sinGracia ? 'El día del corte no da ninguno.' : `El día del corte da ${enDias(linea.minimo)}.`;
  if (deHoy >= diasDelSiguiente) {
    return `Hoy da ${deHoy > diasDelSiguiente ? 'más' : 'lo mismo'} que esperar al día después del corte: ` +
      `el ${fecha(manana)} da ${delSiguiente}. ${delCorte}`;
  }
  return `Conviene usarla el día después del corte: el ${fecha(manana)} da ${delSiguiente}. ${delCorte}`;
}

/**
 * Lo que vence antes que el pago de la barra, si hay algo.
 *
 * Entre el corte y su vencimiento conviven dos pagos: el del estado de cuenta
 * que ya cerró, que es el que muestra el detalle de la tarjeta, y el de este
 * ciclo, que es el de la barra. Los dos se llaman "Pago" y quedan uno encima
 * del otro, así que se dice cuál es cuál. Sale de `proximoPago`, lo mismo que
 * usa el estado de cuenta: si dijera otra fecha, la confusión sería peor.
 */
function loQueVenceAntes(linea: LineaDeTiempo): string | null {
  const pendiente = proximoPago(linea.hoy, linea.diaDeCorte, linea.diaDePago);
  if (pendiente === linea.pago) return null;
  // El que vence antes es siempre el del corte anterior al de la barra: el
  // que cierra el día antes de `inicio`.
  return `Lo del corte del ${fecha(sumarDias(linea.inicio, -1))} vence antes: el ${fecha(pendiente)}.`;
}

/** Todo lo que dice la pieza para una compra del día `compra`. */
export interface TextosDeLaLinea {
  /** El número grande, solo. */
  numero: string;
  /** "días" o "día", al lado del número. */
  unidad: string;
  /** "Si la usás hoy, tenés hasta el 10 ene." */
  frase: string;
  /** Debajo de la barra, a la izquierda: el primer día del ciclo. */
  inicio: string;
  /** Encima de la marca del corte. */
  corte: string;
  /** Debajo de la barra, a la derecha. */
  pago: string;
  /** Cuándo conviene usarla: el día después del corte, con su número. */
  consejo: string;
  /** El pago del corte pasado, si todavía no venció. Null si no hay. */
  antes: string | null;
  /** Para el lector de pantalla: el valor de la barra. */
  valor: string;
}

/** Los textos de la pieza para una compra del día `compra`. */
export function textosDeLaLinea(linea: LineaDeTiempo, compra: string): TextosDeLaLinea {
  const { dias } = diasParaPagar(compra, linea.diaDeCorte, linea.diaDePago);
  return {
    numero: String(dias),
    unidad: dias === 1 ? 'día' : 'días',
    // Sin "para pagarla": el título ya lo dice, y así la frase entra en un
    // renglón aun con la fecha más larga, del mismo modo en las dos apps.
    frase: `${cuando(compra, linea.hoy)}, tenés hasta el ${fecha(linea.pago)}.`,
    inicio: fecha(linea.inicio),
    corte: `Corte ${fecha(linea.corte)}`,
    pago: `Pago ${fecha(linea.pago)}`,
    consejo: consejo(linea),
    antes: loQueVenceAntes(linea),
    valor: `${fecha(compra)}: ${enDias(dias)} para pagar`,
  };
}

/**
 * La línea corta de la Billetera: "Usándola hoy: 41 días para pagar".
 *
 * Está para comparar tarjetas sin entrar a cada una: con dos de crédito, la que
 * da más días hoy es la que conviene usar hoy. Null si falta alguno de los dos
 * días, porque sin ciclo no hay plazo que decir.
 */
export function resumenDeDiasParaPagar(
  hoy: string, diaDeCorte: number | null, diaDePago: number | null,
): string | null {
  if (!diaDeCorte || !diaDePago) return null;
  return `Usándola hoy: ${enDias(diasParaPagar(hoy, diaDeCorte, diaDePago).dias)} para pagar`;
}
