import { View } from 'react-native';
import Texto from './Texto';
import { BudgetProgress } from '@compartido/types';
import { useFormatters } from './ContextoDeAjustes';
import { useCategorias } from './ContextoDeCategorias';
import IconoDeCategoria from './IconoDeCategoria';

/** Verde, ámbar o rojo según qué tan cerca del tope estás. */
export function budgetTone(percent: number) {
  if (percent >= 100) return { bar: 'bg-peligro', text: 'text-peligro', ring: 'border-peligro/30' };
  if (percent >= 80) return { bar: 'bg-aviso', text: 'text-aviso', ring: 'border-aviso/30' };
  return { bar: 'bg-primario', text: 'text-acento', ring: 'border-linea' };
}

const TABULARES = { fontVariant: ['tabular-nums' as const] };

/** El gemelo de components/BudgetBar.tsx. */
export default function BarraDePresupuesto({
  budget, compact,
}: {
  budget: BudgetProgress;
  compact?: boolean;
}) {
  const fmt = useFormatters();
  // Un tope siempre es de gasto: no se le pone techo a lo que entra.
  const { dibujoDe } = useCategorias();
  const tono = budgetTone(budget.percent);
  const ancho = Math.min(budget.percent, 100);
  const colorDelPorcentaje = budget.percent >= 80 ? tono.text : 'text-tinta-2';
  const montos = `${fmt.money(budget.spent)} de ${fmt.money(budget.amount)}`;

  return (
    <View>
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2.5 flex-1">
          <IconoDeCategoria {...dibujoDe(budget.category, 'expense')} type="expense" size="sm" />
          <Texto className="text-sm text-tinta flex-1" numberOfLines={1}>{budget.category}</Texto>
        </View>
        <Texto className={`text-xs ${colorDelPorcentaje}`} style={TABULARES}>{budget.percent}%</Texto>
      </View>
      <View className="h-1 bg-hundido rounded-full overflow-hidden mt-2">
        <View className={`h-full rounded-full ${tono.bar}`} style={{ width: `${ancho}%` }} />
      </View>
      <Texto className="text-xs text-tinta-2 mt-1.5" style={TABULARES}>
        {compact
          ? montos
          : budget.remaining >= 0
            ? `${montos} · te quedan ${fmt.money(budget.remaining)}`
            : `${montos} · te pasaste por ${fmt.money(-budget.remaining)}`}
      </Texto>
    </View>
  );
}
