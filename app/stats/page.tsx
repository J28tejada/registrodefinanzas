'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/types';
import type { Summary } from '@/lib/types';

const COLORS = [
  '#6366f1','#06b6d4','#10b981','#f59e0b',
  '#ef4444','#8b5cf6','#f97316','#14b8a6','#ec4899','#84cc16',
];

const R = 52, SW = 24, C = 2 * Math.PI * R, SZ = 148;

function DonutChart({ categories, total, label }: {
  categories: { category: string; total: number }[];
  total: number;
  label: string;
}) {
  if (!total) return (
    <svg width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`}>
      <circle cx={SZ/2} cy={SZ/2} r={R} fill="none" stroke="#1e293b" strokeWidth={SW} />
      <text x={SZ/2} y={SZ/2 + 5} textAnchor="middle" fill="#475569" fontSize={11}>Sin datos</text>
    </svg>
  );

  let offset = 0;
  return (
    <svg width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`}>
      <circle cx={SZ/2} cy={SZ/2} r={R} fill="none" stroke="#1e293b" strokeWidth={SW} />
      {categories.slice(0, 10).map((cat, i) => {
        const arc = (cat.total / total) * C;
        const el = (
          <circle
            key={i}
            cx={SZ/2} cy={SZ/2} r={R}
            fill="none"
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={SW}
            strokeDasharray={`${arc} ${C}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${SZ/2} ${SZ/2})`}
          />
        );
        offset += arc;
        return el;
      })}
      <text x={SZ/2} y={SZ/2 - 6} textAnchor="middle" fill="#94a3b8" fontSize={10}>{label}</text>
      <text x={SZ/2} y={SZ/2 + 12} textAnchor="middle" fill="white" fontSize={13} fontWeight="bold">
        {formatCurrency(total)}
      </text>
    </svg>
  );
}

export default function StatsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'expense' | 'income'>('expense');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });

  const { monthStart, monthEnd, monthName, isCurrentMonth } = useMemo(() => {
    const { year, month } = selectedMonth;
    const now = new Date();
    const mm = String(month + 1).padStart(2, '0');
    const last = String(new Date(year, month + 1, 0).getDate()).padStart(2, '0');
    return {
      monthStart: `${year}-${mm}-01`,
      monthEnd: `${year}-${mm}-${last}`,
      monthName: new Date(year, month).toLocaleString('es-MX', { month: 'long', year: 'numeric' }),
      isCurrentMonth: year === now.getFullYear() && month === now.getMonth(),
    };
  }, [selectedMonth]);

  const prevMonth = () => setSelectedMonth(({ year, month }) =>
    month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
  );
  const nextMonth = () => setSelectedMonth(({ year, month }) => {
    if (isCurrentMonth) return { year, month };
    return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/summary?startDate=${monthStart}&endDate=${monthEnd}`);
      const data = await res.json();
      if (!data.error) setSummary(data);
    } finally {
      setLoading(false);
    }
  }, [monthStart, monthEnd]);

  useEffect(() => {
    load();
    window.addEventListener('finanzas:refresh', load);
    return () => window.removeEventListener('finanzas:refresh', load);
  }, [load]);

  const categories = summary?.byCategory.filter(c => c.type === tab) ?? [];
  const total = tab === 'expense' ? (summary?.totalExpenses ?? 0) : (summary?.totalIncome ?? 0);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Month nav */}
      <div className="flex items-center gap-1">
        <button onClick={prevMonth} className="p-2 text-slate-400 hover:text-white active:text-white rounded-lg">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="flex-1 text-center font-semibold text-white capitalize">{monthName}</span>
        <button onClick={nextMonth} disabled={isCurrentMonth} className="p-2 text-slate-400 hover:text-white active:text-white disabled:opacity-30 rounded-lg">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Summary row */}
      {summary && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Ingresos', value: summary.totalIncome, cls: 'text-emerald-400' },
            { label: 'Gastos', value: summary.totalExpenses, cls: 'text-rose-400' },
            { label: 'Balance', value: summary.totalBalance, cls: summary.totalBalance >= 0 ? 'text-white' : 'text-rose-400' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 mb-0.5">{label}</p>
              <p className={`font-bold text-sm ${cls}`}>{formatCurrency(value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tab toggle */}
      <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1">
        {(['expense', 'income'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? t === 'expense' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                : 'text-slate-400'
            }`}
          >
            {t === 'expense' ? 'Gastos' : 'Ingresos'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-52 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
      ) : categories.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-3xl mb-3">📊</p>
          <p>No hay {tab === 'expense' ? 'gastos' : 'ingresos'} este mes</p>
        </div>
      ) : (
        <>
          {/* Donut + legend */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
            <div className="flex-shrink-0">
              <DonutChart
                categories={categories}
                total={total}
                label={tab === 'expense' ? 'Gastos' : 'Ingresos'}
              />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              {categories.slice(0, 7).map((cat, i) => (
                <div key={cat.category} className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-xs text-slate-300 truncate flex-1">{cat.category}</span>
                  <span className="text-xs text-slate-500 flex-shrink-0">
                    {Math.round((cat.total / total) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Category bars */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3.5">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">Por categoría</h3>
            {categories.map((cat, i) => {
              const pct = Math.round((cat.total / total) * 100);
              return (
                <div key={`${cat.category}-${cat.scope}`} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-slate-300 truncate">{cat.category}</span>
                      <span className={`text-xs px-1 rounded flex-shrink-0 ${cat.scope === 'personal' ? 'text-violet-400' : 'text-blue-400'}`}>
                        {cat.scope === 'personal' ? 'P' : 'N'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="text-slate-500">{pct}%</span>
                      <span className={tab === 'expense' ? 'text-rose-400' : 'text-emerald-400'}>
                        {formatCurrency(cat.total)}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
