'use client';

import { BudgetProgress } from '@/lib/types';
import { useFormatters } from './SettingsContext';
import { useCategories } from './CategoriesContext';
import CategoryIcon from './CategoryIcon';

/** Verde, ámbar o rojo según qué tan cerca del tope estás. */
export function budgetTone(percent: number) {
  if (percent >= 100) return { bar: 'bg-peligro', text: 'text-peligro', ring: 'border-peligro/30' };
  if (percent >= 80) return { bar: 'bg-aviso', text: 'text-aviso', ring: 'border-aviso/30' };
  return { bar: 'bg-primario', text: 'text-acento', ring: 'border-linea' };
}

export default function BudgetBar({ budget, compact }: { budget: BudgetProgress; compact?: boolean }) {
  const fmt = useFormatters();
  // Un tope siempre es de gasto: no se le pone techo a lo que entra.
  const { dibujoDe } = useCategories();
  const tono = budgetTone(budget.percent);
  const ancho = Math.min(budget.percent, 100);
  // El porcentaje se pinta solo cuando dice algo: cerca del tope o pasado.
  // En verde, un presupuesto tranquilo competía con los que sí piden atención.
  const colorDelPorcentaje = budget.percent >= 80 ? tono.text : 'text-tinta-2';
  const montos = `${fmt.money(budget.spent)} de ${fmt.money(budget.amount)}`;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2.5 min-w-0">
          <CategoryIcon {...dibujoDe(budget.category, 'expense')} type="expense" size="sm" />
          <span className="text-sm text-tinta truncate">{budget.category}</span>
        </span>
        <span className={`text-xs tabular-nums flex-shrink-0 ${colorDelPorcentaje}`}>{budget.percent}%</span>
      </div>
      <div className="h-1 bg-hundido rounded-full overflow-hidden mt-2">
        <div className={`h-full rounded-full transition-all ${tono.bar}`} style={{ width: `${ancho}%` }} />
      </div>
      <p className="text-xs text-tinta-2 tabular-nums mt-1.5">
        {compact
          ? montos
          : budget.remaining >= 0
            ? `${montos} · te quedan ${fmt.money(budget.remaining)}`
            : `${montos} · te pasaste por ${fmt.money(-budget.remaining)}`}
      </p>
    </div>
  );
}
