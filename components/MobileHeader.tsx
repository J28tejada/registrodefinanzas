'use client';

import { useState, useEffect, useCallback } from 'react';
import { MoreHorizontal, X, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import { formatCurrency, Summary } from '@/lib/types';

export default function MobileHeader() {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const load = useCallback(async () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    try {
      const res = await fetch(
        `/api/summary?startDate=${y}-${m}-01&endDate=${y}-${m}-${String(lastDay).padStart(2, '0')}`
      );
      const data = await res.json();
      if (!data.error) setSummary(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('finanzas:refresh', load);
    return () => window.removeEventListener('finanzas:refresh', load);
  }, [load]);

  return (
    <div className="md:hidden sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center">
            <Wallet className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-sm text-white">FinanzasIA</span>
        </div>

        <div className="flex items-center gap-2">
          <UserButton appearance={{ elements: { avatarBox: 'w-7 h-7' } }} />
          <button
            onClick={() => setOpen(v => !v)}
            className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            {open ? <X className="w-4 h-4" /> : <MoreHorizontal className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 grid grid-cols-3 gap-2 border-t border-slate-800/60 pt-3">
          <div className="bg-slate-800/60 rounded-xl p-3 flex flex-col gap-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Balance total</span>
            <span className={`text-sm font-bold ${summary && summary.totalBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {summary ? formatCurrency(summary.totalBalance) : '—'}
            </span>
          </div>
          <div className="bg-slate-800/60 rounded-xl p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] text-slate-500">Ingresos</span>
            </div>
            <span className="text-sm font-semibold text-emerald-400">
              {summary ? formatCurrency(summary.totalIncome) : '—'}
            </span>
          </div>
          <div className="bg-slate-800/60 rounded-xl p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-rose-400" />
              <span className="text-[10px] text-slate-500">Gastos</span>
            </div>
            <span className="text-sm font-semibold text-rose-400">
              {summary ? formatCurrency(summary.totalExpenses) : '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
