import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import Texto from './Texto';
import {
  arcosDelAnillo, GROSOR, LADO, Porcion, RADIO,
} from '@compartido/grafico-de-anillo';

/**
 * El gemelo de components/CategoryDonut.tsx.
 *
 * Los colores, las medidas y el cálculo de los arcos salen del módulo
 * compartido: acá solo cambia con qué se dibuja —`<Circle>` de react-native-svg
 * en lugar de `<circle>`— y que en un teléfono no hay puntero, así que lo que en
 * la web se enfoca al pasar el mouse acá se enfoca al tocar.
 */
export default function AnilloDeCategorias({
  porciones, total, etiqueta, formatearMonto,
}: {
  porciones: Porcion[];
  total: number;
  etiqueta: string;
  formatearMonto: (n: number) => string;
}) {
  const [activa, setActiva] = useState<number | null>(null);

  if (porciones.length === 0 || total <= 0) return null;

  const enfocada = activa !== null ? porciones[activa] : null;
  const arcos = arcosDelAnillo(porciones);

  return (
    <View className="items-center gap-4">
      <View style={{ width: LADO, height: LADO }}>
        <Svg width={LADO} height={LADO} viewBox={`0 0 ${LADO} ${LADO}`}>
          <G transform={`translate(${LADO / 2},${LADO / 2}) rotate(-90)`}>
            {arcos.map((a, i) => (
              <Circle
                key={a.categoria}
                r={RADIO}
                fill="none"
                stroke={a.color}
                strokeWidth={GROSOR}
                strokeDasharray={`${a.trazo} ${a.resto}`}
                strokeDashoffset={-a.desfase}
                opacity={activa === null || activa === i ? 1 : 0.35}
              />
            ))}
          </G>
        </Svg>

        {/* El total al centro: es el número que se lee primero, y el hueco del
            anillo ya está ahí. */}
        <View className="absolute inset-0 items-center justify-center px-7" pointerEvents="none">
          <Texto className="text-[10px] uppercase tracking-wider text-slate-500 text-center" numberOfLines={1}>
            {enfocada ? enfocada.categoria : etiqueta}
          </Texto>
          <Texto className="text-xs font-bold text-white leading-tight text-center"
            numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
            {formatearMonto(enfocada ? enfocada.total : total)}
          </Texto>
          {enfocada ? (
            <Texto className="text-[10px] text-slate-400" style={{ fontVariant: ['tabular-nums'] }}>
              {enfocada.porcentaje.toFixed(1)}%
            </Texto>
          ) : null}
        </View>
      </View>

      {/* La leyenda va siempre: el color solo nunca alcanza para saber qué es qué. */}
      <View className="w-full gap-1.5">
        {porciones.map((p, i) => (
          <Pressable
            key={p.categoria}
            onPress={() => setActiva(activa === i ? null : i)}
            className="w-full flex-row items-center gap-2 rounded px-1 py-0.5"
            style={{ opacity: activa === null || activa === i ? 1 : 0.4 }}
          >
            <View className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
            <Texto className="text-sm text-slate-300 flex-1" numberOfLines={1}>{p.categoria}</Texto>
            <Texto className="text-sm text-slate-500" style={{ fontVariant: ['tabular-nums'] }}>
              {p.porcentaje.toFixed(1)}%
            </Texto>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
