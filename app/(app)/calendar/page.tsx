'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Transaction, formatCurrency } from '@/lib/types';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function compact(n: number): string {
  if (n >= 100000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return new Intl.NumberFormat('es-MX').format(Math.round(n));
}

function buildGrid(year: number, month: number) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells: { day: number; date: string | null; current: boolean }[] = [];

  for (let i = firstDow - 1; i >= 0; i--)
    cells.push({ day: daysInPrev - i, date: null, current: false });

  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    cells.push({ day: d, date: `${year}-${mm}-${dd}`, current: true });
  }

  const rem = (7 - (cells.length % 7)) % 7;
  for (let d = 1; d <= rem; d++)
    cells.push({ day: d, date: null, current: false });

  return cells;
}

export default function CalendarPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
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

  const prevMonth = () => { setSelectedDay(null); setSelectedMonth(({ year, month }) =>
    month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
  ); };
  const nextMonth = () => { setSelectedDay(null); setSelectedMonth(({ year, month }) => {
    if (isCurrentMonth) return { year, month };
    return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
  }); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/transactions?startDate=${monthStart}&endDate=${monthEnd}`);
      const data = await res.json();
      if (Array.isArray(data)) setTransactions(data);
    } finally {
      setLoading(false);
    }
  }, [monthStart, monthEnd]);

  useEffect(() => {
    load();
    window.addEventListener('finanzas:refresh', load);
    return () => window.removeEventListener('finanzas:refresh', load);
  }, [load]);

  const byDate = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    for (const tx of transactions) {
      const e = map.get(tx.date) ?? { income: 0, expense: 0 };
      if (tx.type === 'income') e.income += tx.amount;
      else e.expense += tx.amount;
      map.set(tx.date, e);
    }
    return map;
  }, [transactions]);

  const totalIncome = useMemo(() => transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0), [transactions]);
  const totalExpense = useMemo(() => transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0), [transactions]);

  const grid = useMemo(() => buildGrid(selectedMonth.year, selectedMonth.month), [selectedMonth]);
  const todayStr = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }, []);

  const selectedDayTx = selectedDay ? transactions.filter(t => t.date === selectedDay) : [];

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

      {/* Monthly summary */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-slate-500">Ingresos</p>
          <p className="text-emerald-400 font-bold text-sm">{formatCurrency(totalIncome)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Gastos</p>
          <p className="text-rose-400 font-bold text-sm">{formatCurrency(totalExpense)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Total</p>
          <p className={`font-bold text-sm ${(totalIncome - totalExpense) >= 0 ? 'text-white' : 'text-rose-400'}`}>
            {formatCurrency(totalIncome - totalExpense)}
          </p>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {/* Headers */}
        <div className="grid grid-cols-7 border-b border-slate-800">
          {DAYS.map((d, i) => (
            <div key={d} className={`py-2 text-center text-xs font-medium ${i === 0 ? 'text-rose-400/80' : 'text-slate-500'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        {loading ? (
          <div className="p-8 text-center text-slate-600 text-sm animate-pulse">Cargando...</div>
        ) : (
          <div className="grid grid-cols-7">
            {grid.map((cell, i) => {
              const data = cell.date ? byDate.get(cell.date) : null;
              const isToday = cell.date === todayStr;
              const isSelected = cell.date === selectedDay;
              const isSun = i % 7 === 0;
              const net = data ? data.income - data.expense : 0;

              return (
                <button
                  key={i}
                  onClick={() => cell.current && cell.date && setSelectedDay(
                    selectedDay === cell.date ? null : cell.date
                  )}
                  className={`min-h-[4.5rem] p-1 border-b border-r border-slate-800/40 text-left transition-colors
                    ${!cell.current ? 'opacity-20 pointer-events-none' : ''}
                    ${isSelected ? 'bg-emerald-500/10' : isToday ? 'bg-slate-800/60' : 'hover:bg-slate-800/40'}
                  `}
                >
                  <p className={`text-[11px] font-semibold mb-0.5 ${
                    isSelected ? 'text-emerald-400' :
                    isToday ? 'text-emerald-400' :
                    isSun ? 'text-rose-400/70' : 'text-slate-400'
                  }`}>
                    {cell.day}
                  </p>
                  {data && cell.current && (
                    <div className="space-y-px">
                      {data.income > 0 && (
                        <p className="text-emerald-400 text-[10px] font-medium leading-tight">{compact(data.income)}</p>
                      )}
                      {data.expense > 0 && (
                        <p className="text-rose-400 text-[10px] font-medium leading-tight">-{compact(data.expense)}</p>
                      )}
                      {data.income > 0 && data.expense > 0 && (
                        <p className={`text-[10px] leading-tight font-medium ${net >= 0 ? 'text-slate-300' : 'text-rose-400'}`}>
                          {net >= 0 ? '' : '-'}{compact(Math.abs(net))}
                        </p>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected day transactions */}
      {selectedDay && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-medium text-white">
            {new Date(selectedDay + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          {selectedDayTx.length === 0 ? (
            <p className="text-slate-500 text-sm">Sin transacciones este día</p>
          ) : (
            <div className="space-y-2">
              {selectedDayTx.map(tx => (
                <div key={tx.id} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{tx.description}</p>
                    <p className="text-xs text-slate-500">{tx.category} · {tx.scope === 'personal' ? 'Personal' : 'Negocio'}</p>
                  </div>
                  <p className={`text-sm font-semibold flex-shrink-0 ml-3 ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {tx.type === 'income' ? '+' : '−'}{formatCurrency(tx.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
