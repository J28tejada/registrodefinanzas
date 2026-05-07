'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Wallet, User, Briefcase } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import { formatCurrency, Summary } from '@/lib/types';

export default function SummaryBar() {
  const [summary, setSummary] = useState<Summary | null>(null);

  const load = useCallback(async () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    const start = `${y}-${m}-01`;
    const end = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    try {
      const res = await fetch(`/api/summary?startDate=${start}&endDate=${end}`);
      const data = await res.json();
      if (!data.error) setSummary(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('finanzas:refresh', load);
    return () => window.removeEventListener('finanzas:refresh', load);
  }, [load]);

  if (!summary) {
    return <div className="h-12 bg-slate-900/80 border-b border-slate-800 animate-pulse" />;
  }

  return (
    <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-2.5 flex items-center gap-5 overflow-x-auto scrollbar-none">
      <div className="md:hidden flex-shrink-0">
        <UserButton appearance={{ elements: { avatarBox: 'w-6 h-6' } }} />
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Wallet className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-xs text-slate-500">Total</span>
        <span className={`text-sm font-bold ${summary.totalBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {formatCurrency(summary.totalBalance)}
        </span>
      </div>

      <div className="w-px h-5 bg-slate-700 flex-shrink-0" />

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <User className="w-3.5 h-3.5 text-violet-400" />
        <span className="text-xs text-slate-500">Personal</span>
        <span className={`text-sm font-semibold ${summary.personalBalance >= 0 ? 'text-white' : 'text-rose-400'}`}>
          {formatCurrency(summary.personalBalance)}
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Briefcase className="w-3.5 h-3.5 text-blue-400" />
        <span className="text-xs text-slate-500">Negocio</span>
        <span className={`text-sm font-semibold ${summary.businessBalance >= 0 ? 'text-white' : 'text-rose-400'}`}>
          {formatCurrency(summary.businessBalance)}
        </span>
      </div>

      <div className="w-px h-5 bg-slate-700 flex-shrink-0" />

      <div className="flex items-center gap-1 flex-shrink-0">
        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-xs text-emerald-400">{formatCurrency(summary.totalIncome)}</span>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
        <span className="text-xs text-rose-400">{formatCurrency(summary.totalExpenses)}</span>
      </div>
    </div>
  );
}
