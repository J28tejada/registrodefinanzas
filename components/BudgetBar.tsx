'use client';

import { BudgetProgress } from '@/lib/types';
import { useFormatters } from './SettingsContext';

/** Verde, ámbar o rojo según qué tan cerca del tope estás. */
export function budgetTone(percent: number) {
  if (percent >= 100) return { bar: 'bg-rose-500', text: 'text-rose-400', ring: 'border-rose-500/30' };
  if (percent >= 80) return { bar: 'bg-amber-500', text: 'text-amber-400', ring: 'border-amber-500/30' };
  return { bar: 'bg-emerald-500', text: 'text-emerald-400', ring: 'border-slate-800' };
}

export default function BudgetBar({ budget, compact }: { budget: BudgetProgress; compact?: boolean }) {
  const fmt = useFormatters();
  const tono = budgetTone(budget.percent);
  const ancho = Math.min(budget.percent, 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-300 truncate">{budget.category}</span>
        <span className={`flex-shrink-0 ${tono.text}`}>
          {fmt.money(budget.spent)}
          <span className="text-slate-500"> / {fmt.money(budget.amount)}</span>
        </span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${tono.bar}`} style={{ width: `${ancho}%` }} />
      </div>
      {!compact && (
        <p className="text-xs text-slate-500">
          {budget.remaining >= 0
            ? `Te quedan ${fmt.money(budget.remaining)} · ${budget.percent}% usado`
            : `Te pasaste por ${fmt.money(-budget.remaining)} · ${budget.percent}% del tope`}
        </p>
      )}
    </div>
  );
}
