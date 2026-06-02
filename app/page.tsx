'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, TrendingDown, Wallet, Plus, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import SummaryCard from '@/components/SummaryCard';
import TransactionList from '@/components/TransactionList';
import AddTransactionModal from '@/components/AddTransactionModal';
import { useLedger } from '@/components/LedgerContext';
import { Summary, Transaction, formatCurrency, LEDGER_COLOR_MAP } from '@/lib/types';

function getMonthBounds(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    start: `${year}-${pad(month + 1)}-01`,
    end: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
    label: new Date(year, month, 1).toLocaleString('es-MX', { month: 'long', year: 'numeric' }),
  };
}

export default function DashboardPage() {
  const { currentLedger, refreshLedgers } = useLedger();
  const router = useRouter();

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  const { start: monthStart, end: monthEnd, label: monthName } = getMonthBounds(selectedYear, selectedMonth);

  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();

  const goToPrev = () => {
    if (selectedMonth === 0) { setSelectedYear(y => y - 1); setSelectedMonth(11); }
    else setSelectedMonth(m => m - 1);
  };
  const goToNext = () => {
    if (isCurrentMonth) return;
    if (selectedMonth === 11) { setSelectedYear(y => y + 1); setSelectedMonth(0); }
    else setSelectedMonth(m => m + 1);
  };

  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate: monthStart, endDate: monthEnd });
      if (currentLedger) params.set('ledger_id', currentLedger.id);

      const [sumRes, txRes] = await Promise.all([
        fetch(`/api/summary?${params}`),
        fetch(`/api/transactions?${params}`),
      ]);
      const [sumData, txData] = await Promise.all([sumRes.json(), txRes.json()]);
      if (!sumRes.ok || sumData.error) {
        setError('No se pudo conectar a la base de datos. Verifica que Vercel Postgres esté configurado.');
      } else {
        setSummary(sumData);
        setRecent(Array.isArray(txData) ? txData.slice(0, 10) : []);
      }
    } catch {
      setError('Error al cargar los datos. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [monthStart, monthEnd, currentLedger]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta transacción?')) return;
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    load();
    refreshLedgers();
  };

  const handleSave = () => {
    load();
    refreshLedgers();
  };

  const ledgerColor = currentLedger ? LEDGER_COLOR_MAP[currentLedger.color] : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pt-14 md:pt-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {ledgerColor && (
            <div
              className="w-10 h-10 rounded-xl flex-shrink-0"
              style={{ background: `linear-gradient(to right, ${ledgerColor.dark} 30%, ${ledgerColor.main} 30%)` }}
            />
          )}
          <div>
            <h1 className="text-2xl font-bold text-white">
              {currentLedger?.name ?? 'Dashboard'}
            </h1>
            {/* Month navigator */}
            <div className="flex items-center gap-1 mt-0.5">
              <button
                onClick={goToPrev}
                className="p-0.5 text-slate-500 hover:text-white rounded transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-slate-400 capitalize min-w-[130px] text-center">{monthName}</span>
              <button
                onClick={goToNext}
                disabled={isCurrentMonth}
                className="p-0.5 text-slate-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {!isCurrentMonth && (
                <button
                  onClick={() => { setSelectedYear(now.getFullYear()); setSelectedMonth(now.getMonth()); }}
                  className="text-xs text-emerald-400 hover:text-emerald-300 ml-1 transition-colors"
                >
                  Hoy
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Registrar</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && !loading && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-400 text-sm">
          {error}
        </div>
      )}

      {/* Summary cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl h-28 animate-pulse" />
          ))}
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <SummaryCard title="Ingresos" subtitle="del mes" amount={summary.totalIncome} icon={TrendingUp} variant="income" />
            <SummaryCard title="Gastos" subtitle="del mes" amount={summary.totalExpenses} icon={TrendingDown} variant="expense" />
            <div className="col-span-2 md:col-span-1">
              <SummaryCard title="Balance" subtitle="del mes" amount={summary.totalBalance} icon={Wallet} variant="balance" />
            </div>
          </div>

          {/* Balance total */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                <Wallet className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-slate-400 text-sm capitalize">Balance — {monthName}</p>
                <p className="text-xs text-slate-500">Ingresos − Gastos</p>
              </div>
            </div>
            <p className={`text-2xl font-bold ${summary.totalBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatCurrency(summary.totalBalance)}
            </p>
          </div>

          {/* Category breakdown */}
          {summary.byCategory.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-medium text-slate-300 mb-4">Top categorías del mes</h3>
              <div className="space-y-2.5">
                {summary.byCategory.slice(0, 6).map(cat => {
                  const max = summary.byCategory[0].total;
                  const pct = Math.round((cat.total / max) * 100);
                  const params = new URLSearchParams({
                    category: cat.category,
                    startDate: monthStart,
                    endDate: monthEnd,
                    type: cat.type,
                  });
                  if (currentLedger) params.set('ledger_id', currentLedger.id);
                  return (
                    <button
                      key={`${cat.category}-${cat.type}`}
                      onClick={() => router.push(`/transactions?${params}`)}
                      className="w-full space-y-1 text-left group hover:bg-slate-800/50 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
                    >
                      <div className="flex justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cat.type === 'income' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          <span className="text-slate-300 group-hover:text-white transition-colors">{cat.category}</span>
                        </div>
                        <span className="text-slate-400 group-hover:text-slate-200 transition-colors">{formatCurrency(cat.total)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${cat.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Recent transactions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-300">Transacciones del mes</h3>
          <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
            {([['all', 'Todos'], ['income', 'Ingresos'], ['expense', 'Gastos']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setTypeFilter(val)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  typeFilter === val
                    ? val === 'income'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : val === 'expense'
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <TransactionList
          transactions={typeFilter === 'all' ? recent : recent.filter(tx => tx.type === typeFilter)}
          loading={loading}
          onEdit={tx => { setEditing(tx); setModalOpen(true); }}
          onDelete={handleDelete}
        />
      </div>

      <AddTransactionModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        editingTransaction={editing}
      />
    </div>
  );
}
