'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, Filter, X, Loader2 } from 'lucide-react';
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
  return (
    <Suspense fallback={
      <div className="max-w-4xl mx-auto pt-14 md:pt-0 flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-tinta-2" />
      </div>
    }>
      <TransactionsInner />
    </Suspense>
  );
}

function TransactionsInner() {
  const { currentLedger, refreshLedgers, transactionVersion } = useLedger();
  const searchParams = useSearchParams();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  // Initialize filters from URL params
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionType | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [paramsLoaded, setParamsLoaded] = useState(false);

  // Load URL params once on mount
  useEffect(() => {
    const cat = searchParams.get('category') ?? '';
    const type = searchParams.get('type') ?? '';
    const start = searchParams.get('startDate') ?? '';
    const end = searchParams.get('endDate') ?? '';

    if (cat) setCategoryFilter(cat);
    if (type === 'income' || type === 'expense') setTypeFilter(type);
    if (start) { setStartDate(start); setShowFilters(true); }
    if (end) { setEndDate(end); setShowFilters(true); }
    setParamsLoaded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!paramsLoaded) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (currentLedger) params.set('ledger_id', currentLedger.id);
    if (search) params.set('search', search);
    if (typeFilter) params.set('type', typeFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    try {
      const res = await fetch(`/api/transactions?${params}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        // El motivo real: un mensaje genérico no dice qué hay que arreglar.
        setError(data.error ?? 'No se pudieron cargar las transacciones.');
        setTransactions([]);
      } else {
        setError(null);
        setTransactions(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los datos.');
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, categoryFilter, startDate, endDate, currentLedger, paramsLoaded, transactionVersion]);

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

  const handleSave = () => { load(); refreshLedgers(); };

  const clearDates = () => { setStartDate(''); setEndDate(''); };
  const hasDateFilter = startDate || endDate;

  return (
    <div className="max-w-4xl mx-auto space-y-5 pt-14 md:pt-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-tinta">
            {currentLedger ? currentLedger.name : 'Todos los movimientos'}
          </h1>
          <p className="text-tinta-2 text-sm">{transactions.length} {transactions.length === 1 ? 'movimiento' : 'movimientos'}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`p-2 rounded-lg border transition-colors ${
              showFilters || hasDateFilter
                ? 'bg-hundido border-linea-fuerte text-tinta'
                : 'border-linea-fuerte text-tinta-2 hover:text-tinta hover:bg-hundido'
            }`}
            title="Filtrar por fecha"
          >
            <Filter className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-primario hover:bg-primario/85 text-sobre-primario rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && !loading && (
        <div className="bg-peligro/10 border border-peligro/30 rounded-xl p-4 text-peligro text-sm">
          {error}
        </div>
      )}

      {/* Type filter tabs + search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="flex gap-0.5 bg-hundido rounded-lg p-0.5">
          {TYPE_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTypeFilter(value)}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                typeFilter === value ? 'bg-elevado text-tinta' : 'text-tinta-2 hover:text-tinta'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tinta-2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full bg-hundido border border-linea rounded-lg pl-9 pr-8 py-2 text-tinta placeholder-tinta-3 focus:outline-none focus:border-tinta-3 text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-tinta-2 hover:text-tinta">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Active filters (category + date range) */}
      {(categoryFilter || hasDateFilter) && (
        <div className="flex flex-wrap gap-2">
          {categoryFilter && (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-hundido border border-linea-fuerte text-tinta rounded-full text-xs">
              Categoría: {categoryFilter}
              <button onClick={() => setCategoryFilter('')} className="hover:text-tinta transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {startDate && (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-hundido border border-linea-fuerte text-tinta rounded-full text-xs">
              Desde: {startDate}
              <button onClick={() => setStartDate('')} className="hover:text-tinta transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {endDate && (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-hundido border border-linea-fuerte text-tinta rounded-full text-xs">
              Hasta: {endDate}
              <button onClick={() => setEndDate('')} className="hover:text-tinta transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Date range filter (collapsible) */}
      {showFilters && (
        <div className="bg-panel border border-linea rounded-xl p-4 space-y-3">
          <p className="text-xs text-tinta-2 font-medium">Rango de fechas</p>
          <div className="grid grid-cols-2 gap-3">
            {/* min-w-0: sin esto el item de la grilla mide su contenido mínimo,
                que en iOS es el ancho intrínseco del campo de fecha. */}
            <div className="space-y-1.5 min-w-0">
              <label className="text-xs text-tinta-2">Desde</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2 text-sm text-tinta focus:outline-none focus:border-tinta-3"
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <label className="text-xs text-tinta-2">Hasta</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2 text-sm text-tinta focus:outline-none focus:border-tinta-3"
              />
            </div>
          </div>
          {hasDateFilter && (
            <button onClick={clearDates} className="text-xs text-tinta-2 hover:text-peligro flex items-center gap-1 transition-colors">
              <X className="w-3.5 h-3.5" /> Limpiar fechas
            </button>
          )}
        </div>
      )}

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
