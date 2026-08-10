'use client';

import { useId, useState } from 'react';

export interface Porcion {
  categoria: string;
  total: number;
  porcentaje: number;
  color: string;
  /** Las categorías que quedaron dentro de "Otros", para el tooltip. */
  agrupadas?: string[];
}

/**
 * Paleta categórica validada contra la superficie oscura (slate-900) con
 * `scripts/validate_palette.js` del método de visualización: banda de luminosidad,
 * piso de croma, separación bajo daltonismo, piso de visión normal y contraste.
 *
 * Son cinco tonos y no más a propósito. En un anillo lo que se compara son los
 * segmentos vecinos, y en esa lista los cinco pasan con holgura; sumar un sexto
 * tono hace que dos se vuelvan indistinguibles para quien tiene deuteranopía.
 * Por eso el resto se pliega en "Otros", que va en gris de de-énfasis: no es una
 * categoría, es lo que sobró.
 */
export const COLORES_CATEGORIA = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
export const COLOR_OTROS = '#64748b';
/** Cuántas categorías reales se muestran antes de plegar el resto. */
export const MAXIMO_PORCIONES = COLORES_CATEGORIA.length;

/**
 * El anillo es fino y el hueco grande a propósito: adentro va el total, y con un
 * trazo grueso "RD$32,085.00" no entra y termina montado sobre los segmentos.
 * Hueco = (RADIO − GROSOR/2) × 2 = 110px de ancho útil.
 */
const LADO = 160;
const RADIO = 64;
const GROSOR = 18;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;
/** El separador va en el color de la superficie, no como borde del segmento. */
const SEPARACION = 3;

export default function CategoryDonut({
  porciones, total, etiqueta, formatearMonto,
}: {
  porciones: Porcion[];
  total: number;
  etiqueta: string;
  formatearMonto: (n: number) => string;
}) {
  const [activa, setActiva] = useState<number | null>(null);
  const id = useId();

  if (porciones.length === 0 || total <= 0) return null;

  const enfocada = activa !== null ? porciones[activa] : null;
  // Un solo segmento no necesita separación: sería una muesca sin nada del otro lado.
  const separacion = porciones.length > 1 ? SEPARACION : 0;

  let acumulado = 0;
  const arcos = porciones.map(p => {
    const largo = (p.porcentaje / 100) * CIRCUNFERENCIA;
    const desfase = acumulado;
    acumulado += largo;
    return {
      ...p,
      // Una porción diminuta no puede quedar en negativo al restarle el hueco:
      // se le deja un hilo visible para que exista en el anillo.
      trazo: Math.max(largo - separacion, 1),
      resto: CIRCUNFERENCIA - Math.max(largo - separacion, 1),
      desfase,
    };
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
      <div className="relative flex-shrink-0">
        <svg width={LADO} height={LADO} viewBox={`0 0 ${LADO} ${LADO}`} role="img"
             aria-label={`${etiqueta}: ${formatearMonto(total)} repartido en ${porciones.length} categorías`}>
          <g transform={`translate(${LADO / 2},${LADO / 2}) rotate(-90)`}>
            {arcos.map((a, i) => (
              <circle
                key={a.categoria}
                r={RADIO}
                fill="none"
                stroke={a.color}
                strokeWidth={GROSOR}
                strokeDasharray={`${a.trazo} ${a.resto}`}
                strokeDashoffset={-a.desfase}
                opacity={activa === null || activa === i ? 1 : 0.35}
                className="transition-opacity cursor-pointer"
                onMouseEnter={() => setActiva(i)}
                onMouseLeave={() => setActiva(null)}
                onClick={() => setActiva(activa === i ? null : i)}
                aria-labelledby={`${id}-${i}`}
              >
                <title id={`${id}-${i}`}>{`${a.categoria}: ${formatearMonto(a.total)} (${a.porcentaje.toFixed(1)}%)`}</title>
              </circle>
            ))}
          </g>
        </svg>

        {/* El total al centro: es el número que se lee primero, y el hueco del
            anillo ya está ahí. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-7 text-center">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 truncate max-w-full">
            {enfocada ? enfocada.categoria : etiqueta}
          </p>
          <p className="text-xs font-bold text-white leading-tight tabular-nums truncate max-w-full">
            {formatearMonto(enfocada ? enfocada.total : total)}
          </p>
          {enfocada && (
            <p className="text-[10px] text-slate-400 tabular-nums">{enfocada.porcentaje.toFixed(1)}%</p>
          )}
        </div>
      </div>

      {/* La leyenda va siempre: el color solo nunca alcanza para saber qué es qué. */}
      <ul className="flex-1 min-w-0 w-full space-y-1.5">
        {porciones.map((p, i) => (
          <li key={p.categoria}>
            <button
              onMouseEnter={() => setActiva(i)}
              onMouseLeave={() => setActiva(null)}
              onClick={() => setActiva(activa === i ? null : i)}
              className={`w-full flex items-center gap-2 text-left rounded px-1 py-0.5 transition-opacity ${
                activa === null || activa === i ? 'opacity-100' : 'opacity-40'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: p.color }}
                aria-hidden
              />
              <span className="text-sm text-slate-300 flex-1 min-w-0 truncate">{p.categoria}</span>
              <span className="text-sm text-slate-500 flex-shrink-0 tabular-nums">
                {p.porcentaje.toFixed(1)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
