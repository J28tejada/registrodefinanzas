/**
 * La paleta y la geometría del anillo de categorías, sin depender de la plataforma.
 *
 * El dibujo es SVG en los dos lados —`<circle>` en la web, `<Circle>` de
 * react-native-svg en el teléfono— y los dos toman de acá los colores y los
 * arcos. Si cada uno calculara los suyos, un redondeo distinto movería los
 * segmentos y el gráfico contaría otra cosa en cada aparato.
 */

export interface Porcion {
  categoria: string;
  total: number;
  porcentaje: number;
  color: string;
  /** Las categorías que quedaron dentro de "Otros", para el detalle. */
  agrupadas?: string[];
}

/**
 * Paleta categórica validada contra las dos superficies del tema —el blanco
 * del claro y el #212121 del oscuro—: banda de luminosidad, piso de croma,
 * separación bajo daltonismo y contraste. Pasa las cinco en los dos.
 *
 * Son cinco tonos y no más a propósito. En un anillo lo que se compara son los
 * segmentos vecinos, y en esa lista los cinco pasan con holgura; sumar un sexto
 * hace que dos se vuelvan indistinguibles para quien tiene deuteranopía. Por eso
 * el resto se pliega en "Otros", que va en gris de de-énfasis: no es una
 * categoría, es lo que sobró.
 */
export const COLORES_CATEGORIA = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
export const COLOR_OTROS = '#858279';
/** Cuántas categorías reales se muestran antes de plegar el resto. */
export const MAXIMO_PORCIONES = COLORES_CATEGORIA.length;

/**
 * El anillo es fino y el hueco grande a propósito: adentro va el total, y con un
 * trazo grueso "RD$32,085.00" no entra y termina montado sobre los segmentos.
 */
export const LADO = 160;
export const RADIO = 64;
export const GROSOR = 18;
export const CIRCUNFERENCIA = 2 * Math.PI * RADIO;
/** El separador va en el color de la superficie, no como borde del segmento. */
export const SEPARACION = 3;

export interface Arco extends Porcion {
  trazo: number;
  resto: number;
  desfase: number;
}

/** Los arcos del anillo, en orden, listos para dibujar. */
export function arcosDelAnillo(porciones: Porcion[]): Arco[] {
  // Un solo segmento no necesita separación: sería una muesca sin nada del otro
  // lado.
  const separacion = porciones.length > 1 ? SEPARACION : 0;
  let acumulado = 0;
  return porciones.map(p => {
    const largo = (p.porcentaje / 100) * CIRCUNFERENCIA;
    const desfase = acumulado;
    acumulado += largo;
    // Una porción diminuta no puede quedar en negativo al restarle el hueco: se
    // le deja un hilo visible para que exista en el anillo.
    const trazo = Math.max(largo - separacion, 1);
    return { ...p, trazo, resto: CIRCUNFERENCIA - trazo, desfase };
  });
}
