'use client';

import { useId, useState } from 'react';

import {
  arcosDelAnillo, CIRCUNFERENCIA, COLOR_OTROS, COLORES_CATEGORIA, GROSOR, LADO,
  MAXIMO_PORCIONES, Porcion, RADIO, SEPARACION,
} from '@/lib/grafico-de-anillo';

// Los colores, las medidas y el cálculo de los arcos viven en
// `lib/grafico-de-anillo.ts`, compartidos con la app del teléfono: si cada uno
// calculara los suyos, un redondeo distinto movería los segmentos.
export { COLORES_CATEGORIA, COLOR_OTROS, MAXIMO_PORCIONES };
export type { Porcion };

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
  const arcos = arcosDelAnillo(porciones);

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
          <p className="text-3xs text-tinta-2 truncate max-w-full">
            {enfocada ? enfocada.categoria : etiqueta}
          </p>
          <p className="text-xs font-bold text-tinta leading-tight tabular-nums truncate max-w-full">
            {formatearMonto(enfocada ? enfocada.total : total)}
          </p>
          {enfocada && (
            <p className="text-3xs text-tinta-2 tabular-nums">{enfocada.porcentaje.toFixed(1)}%</p>
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
              <span className="text-sm text-tinta flex-1 min-w-0 truncate">{p.categoria}</span>
              <span className="text-sm text-tinta-2 flex-shrink-0 tabular-nums">
                {p.porcentaje.toFixed(1)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
