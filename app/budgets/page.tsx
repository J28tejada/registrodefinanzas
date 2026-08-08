'use client';

import { useCallback, useEffect, useState } from 'react';
import { Target, Plus, Trash2, Loader2, AlertCircle, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import BudgetBar, { budgetTone } from '@/components/BudgetBar';
import { useFormatters } from '@/components/SettingsContext';
import { useLedger } from '@/components/LedgerContext';
import { useCategories } from '@/components/CategoriesContext';
import { BudgetProgress } from '@/lib/types';

export default function BudgetsPage() {
  const fmt = useFormatters();
  const { transactionVersion } = useLedger();
  const { categorias, refrescar: refrescarCategorias } = useCategories();

  const [mes, setMes] = useState<string>(() => fmt.today().slice(0, 7));
  const [budgets, setBudgets] = useState<BudgetProgress[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [categoria, setCategoria] = useState('');
  const [monto, setMonto] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Crear la categoría sin salir de acá: si hay que ir a otra pantalla y
  // volver, se pierde el monto que ya se estaba escribiendo.
  const [creandoCat, setCreandoCat] = useState(false);
  const [nuevaCat, setNuevaCat] = useState('');
  const [errorCat, setErrorCat] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await fetch(`/api/budgets?month=${mes}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudieron cargar los presupuestos');
      setBudgets(data.budgets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    } finally {
      setCargando(false);
    }
  }, [mes]);

  useEffect(() => { cargar(); }, [cargar, transactionVersion]);

  const moverMes = (delta: number) => {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMes(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  const guardar = async () => {
    if (!categoria || !monto) return;
    setGuardando(true);
    setError('');
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: categoria, amount: Number(monto) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar');
      setCategoria('');
      setMonto('');
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (id: string, categoria: string) => {
    if (!confirm(`¿Eliminar el presupuesto de ${categoria}?`)) return;
    await fetch(`/api/budgets/${id}`, { method: 'DELETE' });
    await cargar();
  };

  // Solo gastos: un presupuesto es un tope de gasto, no de ingreso.
  const disponibles = categorias
    .filter(c => c.type === 'expense')
    .map(c => c.name)
    .filter((c, i, arr) => arr.indexOf(c) === i)
    .filter(c => !budgets.some(b => b.category === c))
    .sort((a, b) => a.localeCompare(b, 'es'));

  const crearCategoria = async () => {
    const nombre = nuevaCat.trim();
    if (!nombre) return;
    setErrorCat('');
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Personal por defecto: es el ámbito de la enorme mayoría de los topes.
        body: JSON.stringify({ name: nombre, type: 'expense', scope: 'personal' }),
      });
      const datos = await res.json();
      if (!res.ok) { setErrorCat(datos.error ?? 'No se pudo crear'); return; }

      await refrescarCategorias();
      // Queda elegida, que es lo que venías a hacer.
      setCategoria(datos.name);
      setNuevaCat('');
      setCreandoCat(false);
    } catch {
      setErrorCat('No se pudo crear la categoría');
    }
  };
  const totalTope = budgets.reduce((s, b) => s + b.amount, 0);
  const totalGastado = budgets.reduce((s, b) => s + b.spent, 0);
  const excedidos = budgets.filter(b => b.percent >= 100);

  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-14 md:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Presupuestos</h1>
          <p className="text-slate-400 text-sm">Un tope mensual por categoría de gasto</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 pt-1">
          <button onClick={() => moverMes(-1)} className="p-1 text-slate-500 hover:text-white rounded transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-slate-400 capitalize min-w-[120px] text-center">
            {fmt.monthLabel(`${mes}-01`)}
          </span>
          <button onClick={() => moverMes(1)} className="p-1 text-slate-500 hover:text-white rounded transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Totales */}
      {budgets.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300">Total presupuestado</p>
              <p className="text-xs text-slate-500">
                {excedidos.length > 0
                  ? `${excedidos.length} categoría${excedidos.length > 1 ? 's' : ''} pasada${excedidos.length > 1 ? 's' : ''} del tope`
                  : 'Todo dentro del tope'}
              </p>
            </div>
            <p className={`text-xl font-bold ${budgetTone(totalTope > 0 ? Math.round((totalGastado / totalTope) * 100) : 0).text}`}>
              {fmt.money(totalGastado)}
              <span className="text-sm text-slate-500 font-normal"> / {fmt.money(totalTope)}</span>
            </p>
          </div>
        </div>
      )}

      {/* Alta */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
        <p className="text-sm font-medium text-slate-300 flex items-center gap-2">
          <Target className="w-4 h-4 text-emerald-400" /> Nuevo presupuesto
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 pr-8 text-sm text-white focus:outline-none focus:border-emerald-500 appearance-none"
            >
              <option value="">Elegí una categoría</option>
              {disponibles.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          <button
            type="button"
            onClick={() => { setCreandoCat(v => !v); setErrorCat(''); }}
            title="Crear una categoría nueva"
            className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5 flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="sm:hidden">Nueva categoría</span>
          </button>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={monto}
            onChange={e => setMonto(e.target.value)}
            placeholder="Tope mensual"
            className="sm:w-40 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={guardar}
            disabled={guardando || !categoria || !monto}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 flex-shrink-0"
          >
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Agregar
          </button>
        </div>

        {creandoCat && (
          <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 space-y-2">
            <label className="text-xs text-slate-400">Nombre de la categoría nueva</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={nuevaCat}
                onChange={e => { setNuevaCat(e.target.value); setErrorCat(''); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); crearCategoria(); } }}
                placeholder="Ej: Mascota, Gimnasio…"
                autoFocus
                maxLength={40}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={crearCategoria}
                disabled={!nuevaCat.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Crear
              </button>
            </div>
            {errorCat && <p className="text-xs text-rose-400">{errorCat}</p>}
            <p className="text-xs text-slate-500">
              Se crea como gasto personal. Podés renombrarla o borrarla desde Configuración.
            </p>
          </div>
        )}
        {disponibles.length === 0 && (
          <p className="text-xs text-slate-500">Ya tenés un presupuesto para cada categoría de gasto.</p>
        )}
      </div>

      {/* Lista */}
      {cargando ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl h-20 animate-pulse" />
          ))}
        </div>
      ) : budgets.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Todavía no tenés presupuestos.</p>
          <p className="text-sm mt-1">Ponele un tope a una categoría y te aviso cuando te acerques.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {budgets.map(b => (
            <div
              key={b.id}
              className={`bg-slate-900 border rounded-xl px-4 py-3.5 flex items-center gap-3 group ${budgetTone(b.percent).ring}`}
            >
              <div className="flex-1 min-w-0">
                <BudgetBar budget={b} />
              </div>
              <button
                onClick={() => eliminar(b.id, b.category)}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100"
                title="Eliminar presupuesto"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500 text-center">
        El tope se compara contra los gastos del mes, en todas tus cuentas.
        Si vinculaste WhatsApp, te aviso ahí mismo al anotar un gasto que te pase del tope.
      </p>
    </div>
  );
}
