import { View } from 'react-native';
import Texto from './Texto';
import { BudgetProgress } from '@compartido/types';
import { useFormatters } from './ContextoDeAjustes';
import { useCategorias } from './ContextoDeCategorias';
import IconoDeCategoria from './IconoDeCategoria';

/** Verde, ámbar o rojo según qué tan cerca del tope estás. */
export function budgetTone(percent: number) {
  if (percent >= 100) return { bar: 'bg-rose-500', text: 'text-rose-400', ring: 'border-rose-500/30' };
  if (percent >= 80) return { bar: 'bg-amber-500', text: 'text-amber-400', ring: 'border-amber-500/30' };
  return { bar: 'bg-emerald-500', text: 'text-emerald-400', ring: 'border-slate-800' };
}

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

  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2 flex-1">
          <IconoDeCategoria {...dibujoDe(budget.category, 'expense')} type="expense" size="sm" />
          <Texto className="text-xs text-slate-300 flex-1" numberOfLines={1}>{budget.category}</Texto>
        </View>
        <Texto className={`text-xs ${tono.text}`}>
          {fmt.money(budget.spent)}
          <Texto className="text-slate-500"> / {fmt.money(budget.amount)}</Texto>
        </Texto>
      </View>
      <View className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <View className={`h-full rounded-full ${tono.bar}`} style={{ width: `${ancho}%` }} />
      </View>
      {!compact ? (
        <Texto className="text-xs text-slate-500">
          {budget.remaining >= 0
            ? `Te quedan ${fmt.money(budget.remaining)} · ${budget.percent}% usado`
            : `Te pasaste por ${fmt.money(-budget.remaining)} · ${budget.percent}% del tope`}
        </Texto>
      ) : null}
    </View>
  );
}
