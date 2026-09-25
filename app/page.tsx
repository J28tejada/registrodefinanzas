'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import MonthSummary from '@/components/MonthSummary';
import TransactionList from '@/components/TransactionList';
import AddTransactionModal from '@/components/AddTransactionModal';
import BudgetBar from '@/components/BudgetBar';
import CardAlerts from '@/components/CardAlerts';
import { useLedger } from '@/components/LedgerContext';
import { useFormatters } from '@/components/SettingsContext';
import { BudgetProgress, Summary, Transaction, LEDGER_COLOR_MAP } from '@/lib/types';
import { limitesDelMes } from '@/lib/format';
import { AvisoDeTarjeta } from '@/lib/tarjetas';

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
  const [avisos, setAvisos] = useState<AvisoDeTarjeta[]>([]);

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

  /**
   * Los vencimientos de tarjeta se piden aparte del resto.
   *
   * No dependen del mes que se esté mirando —lo que vence, vence hoy— y no
   * tienen por qué frenar al tablero si fallan: si no se pueden traer, el resto
   * se ve igual y el aviso llega por chat.
   */
  useEffect(() => {
    let vigente = true;
    fetch('/api/cards/avisos')
      .then(r => (r.ok ? r.json() : { avisos: [] }))
      .then(d => { if (vigente) setAvisos(d.avisos ?? []); })
      .catch(() => {});
    return () => { vigente = false; };
  }, [transactionVersion]);

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
    <div className="max-w-4xl mx-auto space-y-8 pt-14 md:pt-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-tinta flex items-center gap-2">
              {/* El color de la cuenta, chico: la identifica sin competir con los números. */}
              {ledgerColor && <span className="w-3 h-3 rounded flex-shrink-0" style={{ background: ledgerColor.main }} />}
              {currentLedger?.name ?? 'Inicio'}
            </h1>
            {/* Month navigator */}
            <div className="flex items-center gap-1 mt-0.5">
              <button
                onClick={goToPrev}
                className="p-0.5 text-tinta-2 hover:text-tinta rounded transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-tinta-2 min-w-[130px] text-center">{monthName}</span>
              <button
                onClick={goToNext}
                disabled={isCurrentMonth}
                className="p-0.5 text-tinta-2 hover:text-tinta disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {!isCurrentMonth && (
                <button
                  onClick={irAlMesActual}
                  className="text-xs font-medium text-tinta hover:text-tinta-2 ml-1 transition-colors"
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
            className="p-2 text-tinta-2 hover:text-tinta hover:bg-hundido rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            className="flex items-center gap-2 px-3.5 py-2 bg-primario hover:bg-primario/85 text-sobre-primario rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Registrar</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && !loading && (
        <div className="bg-peligro/10 border border-peligro/30 rounded-xl p-4 text-peligro text-sm">
          {error}
        </div>
      )}

      {/* Lo que vence en los próximos días. Va arriba de los totales: una fecha
          de pago que se pasa cuesta un cargo por mora, y eso urge más que saber
          cuánto se gastó. */}
      <CardAlerts avisos={avisos} />

      {loading ? (
        <div className="bg-hundido rounded-xl h-36 animate-pulse" />
      ) : summary ? (
        <>
          <MonthSummary
            income={summary.totalIncome}
            expenses={summary.totalExpenses}
            balance={summary.totalBalance}
            incomeHref={`/transactions?type=income&startDate=${monthStart}&endDate=${monthEnd}${currentLedger ? `&ledger_id=${currentLedger.id}` : ''}`}
            expensesHref={`/transactions?type=expense&startDate=${monthStart}&endDate=${monthEnd}${currentLedger ? `&ledger_id=${currentLedger.id}` : ''}`}
          />

          {/* Presupuestos del mes */}
          {budgets.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-base font-semibold text-tinta">Presupuestos</h3>
                <Link href="/budgets" className="text-sm text-tinta-2 hover:text-tinta transition-colors">
                  Ver todos
                </Link>
              </div>
              {/* Filas separadas por una línea, sin tarjeta alrededor: es una
                  lista, y una caja con borde no le agregaba nada. */}
              {[...budgets]
                .sort((a, b) => b.percent - a.percent)
                .slice(0, 4)
                .map(b => (
                  <div key={b.id} className="py-3.5 border-t border-linea">
                    <BudgetBar budget={b} compact />
                  </div>
                ))}
            </section>
          )}

          {/* Category breakdown */}
          {summary.byCategory.length > 0 && (
            <section>
              <h3 className="text-base font-semibold text-tinta mb-1">Categorías del mes</h3>
              <div>
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
                      className="block py-3 border-t border-linea group hover:bg-hundido transition-colors"
                    >
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="text-tinta truncate">{cat.category}</span>
                        <span className={`tabular-nums flex-shrink-0 ${cat.type === 'income' ? 'text-acento' : 'text-tinta-2'}`}>
                          {cat.type === 'income' ? '+' : ''}{fmt.money(cat.total)}
                        </span>
                      </div>
                      {/* La barra compara contra la categoría más grande del mes. */}
                      <div className="h-1 bg-hundido rounded-full overflow-hidden mt-2">
                        <div
                          className={`h-full rounded-full transition-all ${cat.type === 'income' ? 'bg-acento' : 'bg-tinta-3'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </>
      ) : null}

      {/* Recent transactions */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <h3 className="text-base font-semibold text-tinta">Movimientos del mes</h3>
          <div className="flex gap-0.5 bg-hundido rounded-lg p-0.5 self-start sm:self-auto">
            {([['all', 'Todos'], ['income', 'Ingresos'], ['expense', 'Gastos']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setTypeFilter(val)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  typeFilter === val ? 'bg-elevado text-tinta' : 'text-tinta-2 hover:text-tinta'
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
