'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, Wallet, Briefcase,
  Plus, RefreshCw, User,
} from 'lucide-react';
import SummaryCard from '@/components/SummaryCard';
import TransactionList from '@/components/TransactionList';
import AddTransactionModal from '@/components/AddTransactionModal';
import { Summary, Transaction, formatCurrency } from '@/lib/types';

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
  const monthName = now.toLocaleString('es-MX', { month: 'long', year: 'numeric' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, txRes] = await Promise.all([
        fetch(`/api/summary?startDate=${monthStart}&endDate=${monthEnd}`),
        fetch(`/api/transactions?startDate=${monthStart}&endDate=${monthEnd}`),
      ]);
      const [sumData, txData] = await Promise.all([sumRes.json(), txRes.json()]);
      if (!sumRes.ok || sumData.error) {
        setError('No se pudo conectar a la base de datos.');
      } else {
        setSummary(sumData);
        setRecent(Array.isArray(txData) ? txData.slice(0, 10) : []);
      }
    } catch {
      setError('Error al cargar los datos.');
    } finally {
      setLoading(false);
    }
  }, [monthStart, monthEnd]);

  useEffect(() => {
    load();
    window.addEventListener('finanzas:refresh', load);
    return () => window.removeEventListener('finanzas:refresh', load);
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta transacción?')) return;
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    load();
    window.dispatchEvent(new Event('finanzas:refresh'));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white capitalize">Dashboard</h1>
          <p className="text-slate-400 text-sm capitalize">{monthName}</p>
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

      {error && !loading && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl h-28 animate-pulse" />
          ))}
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard title="Ingresos" subtitle="este mes" amount={summary.totalIncome} icon={TrendingUp} variant="income" />
            <SummaryCard title="Gastos" subtitle="este mes" amount={summary.totalExpenses} icon={TrendingDown} variant="expense" />
            <SummaryCard title="Balance Personal" amount={summary.personalBalance} icon={User} variant="personal" />
            <SummaryCard title="Balance Negocio" amount={summary.businessBalance} icon={Briefcase} variant="business" />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                <Wallet className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-slate-400 text-sm">Balance Total del Mes</p>
                <p className="text-xs text-slate-500">Ingresos − Gastos (personal + negocio)</p>
              </div>
            </div>
            <p className={`text-2xl font-bold ${summary.totalBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatCurrency(summary.totalBalance)}
            </p>
          </div>

          {summary.byCategory.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-medium text-slate-300 mb-4">Top categorías del mes</h3>
              <div className="space-y-2.5">
                {summary.byCategory.slice(0, 6).map(cat => {
                  const max = summary.byCategory[0].total;
                  const pct = Math.round((cat.total / max) * 100);
                  return (
                    <div key={`${cat.category}-${cat.type}-${cat.scope}`} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${cat.type === 'income' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          <span className="text-slate-300">{cat.category}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${cat.scope === 'personal' ? 'text-violet-400 bg-violet-500/10' : 'text-blue-400 bg-blue-500/10'}`}>
                            {cat.scope === 'personal' ? 'Personal' : 'Negocio'}
                          </span>
                        </div>
                        <span className="text-slate-400">{formatCurrency(cat.total)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${cat.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : null}

      <div>
        <h3 className="text-sm font-medium text-slate-300 mb-3">Últimas transacciones del mes</h3>
        <TransactionList
          transactions={recent}
          loading={loading}
          onEdit={tx => { setEditing(tx); setModalOpen(true); }}
          onDelete={handleDelete}
        />
      </div>

      <AddTransactionModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={() => { load(); window.dispatchEvent(new Event('finanzas:refresh')); }}
        editingTransaction={editing}
      />
    </div>
  );
}
