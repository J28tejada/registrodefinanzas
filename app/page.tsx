'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown, Wallet, Plus, RefreshCw, ChevronLeft, ChevronRight, Target } from 'lucide-react';
import SummaryCard from '@/components/SummaryCard';
import TransactionList from '@/components/TransactionList';
import AddTransactionModal from '@/components/AddTransactionModal';
import BudgetBar from '@/components/BudgetBar';
import { useLedger } from '@/components/LedgerContext';
import { useFormatters } from '@/components/SettingsContext';
import { BudgetProgress, Summary, Transaction, LEDGER_COLOR_MAP } from '@/lib/types';
import { limitesDelMes } from '@/lib/format';

export default function DashboardPage() {
  const { currentLedger, refreshLedgers, transactionVersion } = useLedger();
  const fmt = useFormatters();

  // "Hoy" sale de la zona horaria del usuario, no de la del navegador.
  const hoy = fmt.today();
  const [anioActual, mesActual] = hoy.split('-').map(Number);
  const [selectedYear, setSelectedYear] = useState(anioActual);
  const [selectedMonth, setSelectedMonth] = useState(mesActual - 1);

  const mesISO = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
  const { start: monthStart, end: monthEnd } = limitesDelMes(mesISO);
  const monthName = fmt.monthLabel(mesISO);

  const isCurrentMonth = selectedYear === anioActual && selectedMonth === mesActual - 1;

  const goToPrev = () => {
    if (selectedMonth === 0) { setSelectedYear(y => y - 1); setSelectedMonth(11); }
    else setSelectedMonth(m => m - 1);
  };
  const goToNext = () => {
    if (isCurrentMonth) return;
    if (selectedMonth === 11) { setSelectedYear(y => y + 1); setSelectedMonth(0); }
    else setSelectedMonth(m => m + 1);
  };

  const irAlMesActual = () => {
    setSelectedYear(anioActual);
    setSelectedMonth(mesActual - 1);
  };

  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<BudgetProgress[]>([]);
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

      const [sumRes, txRes, budRes] = await Promise.all([
        fetch(`/api/summary?${params}`),
        fetch(`/api/transactions?${params}`),
        // Con la cuenta puesta: un tope del hogar no tiene nada que hacer en el
        // panel de la cuenta personal.
        fetch(`/api/budgets?month=${monthStart.slice(0, 7)}${currentLedger ? `&ledger_id=${currentLedger.id}` : ''}`),
      ]);
      const [sumData, txData, budData] = await Promise.all([sumRes.json(), txRes.json(), budRes.json()]);
      if (!sumRes.ok || sumData.error) {
        // El motivo real: un "no se pudo conectar" genérico no dice qué arreglar.
        setError(sumData.error ?? 'No se pudieron cargar los datos.');
      } else {
        setSummary(sumData);
        setRecent(Array.isArray(txData) ? txData.slice(0, 10) : []);
        setBudgets(budRes.ok && Array.isArray(budData.budgets) ? budData.budgets : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los datos.');
    } finally {
      setLoading(false);
    }
  }, [monthStart, monthEnd, currentLedger, transactionVersion]);

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
            <h1 className="text-xl sm:text-2xl font-bold text-white">
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
                  onClick={irAlMesActual}
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
            <SummaryCard
              title="Ingresos" subtitle="del mes"
              amount={summary.totalIncome} icon={TrendingUp} variant="income"
              href={`/transactions?type=income&startDate=${monthStart}&endDate=${monthEnd}${currentLedger ? `&ledger_id=${currentLedger.id}` : ''}`}
            />
            <SummaryCard
              title="Gastos" subtitle="del mes"
              amount={summary.totalExpenses} icon={TrendingDown} variant="expense"
              href={`/transactions?type=expense&startDate=${monthStart}&endDate=${monthEnd}${currentLedger ? `&ledger_id=${currentLedger.id}` : ''}`}
            />
            <div className="col-span-2 md:col-span-1">
              <SummaryCard title="Balance" subtitle="del mes" amount={summary.totalBalance} icon={Wallet} variant="balance" />
            </div>
          </div>

          {/* Balance total */}
          {/* `min-w-0` a la izquierda y `flex-shrink-0` al monto: sin eso, un
              balance de seis cifras no se achica y termina pisando al texto,
              como pasaba en la tarjeta de totales de Presupuestos. */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <Wallet className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-slate-400 text-sm capitalize">Balance — {monthName}</p>
                <p className="text-xs text-slate-500">Ingresos − Gastos</p>
              </div>
            </div>
            <p className={`text-xl sm:text-2xl font-bold tabular-nums flex-shrink-0 ${summary.totalBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {fmt.money(summary.totalBalance)}
            </p>
          </div>

          {/* Presupuestos del mes */}
          {budgets.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-400" /> Presupuestos del mes
                </h3>
                <Link href="/budgets" className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                  Ver todos
                </Link>
              </div>
              <div className="space-y-3">
                {[...budgets]
                  .sort((a, b) => b.percent - a.percent)
                  .slice(0, 4)
                  .map(b => <BudgetBar key={b.id} budget={b} compact />)}
              </div>
            </div>
          )}

          {/* Category breakdown */}
          {summary.byCategory.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5">
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
                    <Link
                      key={`${cat.category}-${cat.type}`}
                      href={`/transactions?${params}`}
                      className="block space-y-1 group hover:bg-slate-800/50 rounded-lg px-2 py-1.5 transition-colors cursor-pointer"
                    >
                      <div className="flex justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cat.type === 'income' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          <span className="text-slate-300 group-hover:text-white transition-colors">{cat.category}</span>
                        </div>
                        <span className="text-slate-400 group-hover:text-slate-200 transition-colors">{fmt.money(cat.total)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${cat.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Recent transactions */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <h3 className="text-sm font-medium text-slate-300">Transacciones del mes</h3>
          <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 self-start sm:self-auto">
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
