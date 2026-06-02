'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Filter, X } from 'lucide-react';
import TransactionList from '@/components/TransactionList';
import AddTransactionModal from '@/components/AddTransactionModal';
import { useLedger } from '@/components/LedgerContext';
import { Transaction, TransactionType } from '@/lib/types';

const TYPE_TABS: { value: TransactionType | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'income', label: 'Ingresos' },
  { value: 'expense', label: 'Gastos' },
];

export default function TransactionsPage() {
  const { currentLedger, refreshLedgers } = useLedger();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionType | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (currentLedger) params.set('ledger_id', currentLedger.id);
    if (search) params.set('search', search);
    if (typeFilter) params.set('type', typeFilter);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    try {
      const res = await fetch(`/api/transactions?${params}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        setError('No se pudo conectar a la base de datos. Verifica que Vercel Postgres esté configurado.');
        setTransactions([]);
      } else {
        setError(null);
        setTransactions(Array.isArray(data) ? data : []);
      }
    } catch {
      setError('Error al cargar los datos. Intenta de nuevo.');
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, startDate, endDate, currentLedger]);

  useEffect(() => {
    const timeout = setTimeout(load, 300);
    return () => clearTimeout(timeout);
  }, [load]);

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

  const clearDates = () => { setStartDate(''); setEndDate(''); };
  const hasDateFilter = startDate || endDate;

  return (
    <div className="max-w-4xl mx-auto space-y-5 pt-14 md:pt-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {currentLedger ? currentLedger.name : 'Todas las transacciones'}
          </h1>
          <p className="text-slate-400 text-sm">{transactions.length} registros</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`p-2 rounded-lg border transition-colors ${
              showFilters || hasDateFilter
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Filtrar por fecha"
          >
            <Filter className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && !loading && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-400 text-sm">
          {error}
        </div>
      )}

      {/* Type filter tabs — always visible */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
          {TYPE_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTypeFilter(value)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                typeFilter === value
                  ? value === 'income'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : value === 'expense'
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-8 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Date range filter (collapsible) */}
      {showFilters && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <p className="text-xs text-slate-400 font-medium">RANGO DE FECHAS</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Desde</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Hasta</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          {hasDateFilter && (
            <button onClick={clearDates} className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors">
              <X className="w-3.5 h-3.5" /> Limpiar fechas
            </button>
          )}
        </div>
      )}

      {/* List */}
      <TransactionList
        transactions={transactions}
        loading={loading}
        onEdit={tx => { setEditing(tx); setModalOpen(true); }}
        onDelete={handleDelete}
      />

      <AddTransactionModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        editingTransaction={editing}
      />
    </div>
  );
}
