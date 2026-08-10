'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, AlertCircle, PieChart, ChevronRight as Flecha } from 'lucide-react';
import CategoryDonut, {
  COLORES_CATEGORIA, COLOR_OTROS, MAXIMO_PORCIONES, Porcion,
} from '@/components/CategoryDonut';
import { useFormatters } from '@/components/SettingsContext';
import { useLedger } from '@/components/LedgerContext';
import { Summary, TransactionType } from '@/lib/types';
import { limitesDelMes } from '@/lib/format';

export default function StatsPage() {
  const fmt = useFormatters();
  const { currentLedger, transactionVersion } = useLedger();

  const [mes, setMes] = useState<string>(() => fmt.today().slice(0, 7));
  const [tipo, setTipo] = useState<TransactionType>('expense');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const { start, end } = limitesDelMes(`${mes}-01`);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const params = new URLSearchParams({ startDate: start, endDate: end });
      if (currentLedger) params.set('ledger_id', currentLedger.id);
      const res = await fetch(`/api/summary?${params}`);
      const datos = await res.json();
      if (!res.ok) throw new Error(datos.error ?? 'No se pudieron cargar las estadísticas');
      setSummary(datos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las estadísticas');
    } finally {
      setCargando(false);
    }
  }, [start, end, currentLedger]);

  useEffect(() => { cargar(); }, [cargar, transactionVersion]);

  const moverMes = (delta: number) => {
    const [a, m] = mes.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1 + delta, 1));
    setMes(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  /** Las categorías del tipo elegido, ordenadas y con su parte del total. */
  const { filas, total } = useMemo(() => {
    const propias = (summary?.byCategory ?? [])
      .filter(c => c.type === tipo && c.total > 0)
      .sort((a, b) => b.total - a.total);
    const suma = propias.reduce((s, c) => s + c.total, 0);
    return {
      filas: propias.map(c => ({
        ...c,
        porcentaje: suma > 0 ? (c.total / suma) * 100 : 0,
      })),
      total: suma,
    };
  }, [summary, tipo]);

  /**
   * Para el anillo, las primeras y el resto plegado en "Otros".
   *
   * El plegado no es cosmético: pasando los seis segmentos, dos tonos cualesquiera
   * se vuelven indistinguibles bajo daltonismo, y un anillo con doce porciones no
   * se lee de todos modos. La lista de abajo sigue mostrando todas, una por una.
   */
  const porciones: Porcion[] = useMemo(() => {
    const cabeza = filas.slice(0, MAXIMO_PORCIONES).map((c, i) => ({
      categoria: c.category,
      total: c.total,
      porcentaje: c.porcentaje,
      color: COLORES_CATEGORIA[i],
    }));
    const cola = filas.slice(MAXIMO_PORCIONES);
    if (cola.length === 0) return cabeza;
    return [...cabeza, {
      categoria: 'Otros',
      total: cola.reduce((s, c) => s + c.total, 0),
      porcentaje: cola.reduce((s, c) => s + c.porcentaje, 0),
      color: COLOR_OTROS,
      agrupadas: cola.map(c => c.category),
    }];
  }, [filas]);

  const etiqueta = tipo === 'expense' ? 'Gastos' : 'Ingresos';
  const cuenta = currentLedger ? `&ledger_id=${currentLedger.id}` : '';

  return (
    <div className="max-w-2xl mx-auto space-y-5 pt-14 md:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white">Estadísticas</h1>
          <p className="text-slate-400 text-sm truncate">
            {currentLedger ? currentLedger.name : 'Todas las cuentas'}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 pt-1">
          <button onClick={() => moverMes(-1)} aria-label="Mes anterior"
                  className="p-1 text-slate-500 hover:text-white rounded transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-slate-400 capitalize min-w-[110px] text-center">
            {fmt.monthLabel(`${mes}-01`)}
          </span>
          <button onClick={() => moverMes(1)} aria-label="Mes siguiente"
                  className="p-1 text-slate-500 hover:text-white rounded transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Gastos / Ingresos */}
      <div className="grid grid-cols-2 gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
        {(['expense', 'income'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            aria-pressed={tipo === t}
            className={`py-2 rounded-lg text-sm font-medium transition-colors ${
              tipo === t ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t === 'expense' ? 'Gastos' : 'Ingresos'}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {cargando ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl h-52 animate-pulse" />
      ) : filas.length === 0 ? (
        <div className="text-center py-12 text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
          <PieChart className="w-8 h-8 mx-auto mb-3 text-slate-600" />
          <p className="text-sm">No hay {etiqueta.toLowerCase()} en este mes.</p>
        </div>
      ) : (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5">
            <CategoryDonut
              porciones={porciones}
              total={total}
              etiqueta={etiqueta}
              formatearMonto={fmt.money}
            />
          </div>

          {/* El anillo da la proporción de un vistazo; los montos exactos y la
              comparación entre categorías cercanas se leen acá. */}
          <div className="space-y-2">
            {filas.map((c, i) => {
              const color = i < MAXIMO_PORCIONES ? COLORES_CATEGORIA[i] : COLOR_OTROS;
              return (
                <Link
                  key={c.category}
                  href={`/transactions?type=${tipo}&category=${encodeURIComponent(c.category)}&startDate=${start}&endDate=${end}${cuenta}`}
                  className="block bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl px-4 py-3 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} aria-hidden />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{c.category}</p>
                      <p className="text-xs text-slate-500">
                        {c.porcentaje.toFixed(1)}% · {c.count} {c.count === 1 ? 'movimiento' : 'movimientos'}
                      </p>
                    </div>
                    <p className={`text-sm font-semibold flex-shrink-0 tabular-nums ${
                      tipo === 'expense' ? 'text-rose-400' : 'text-emerald-400'
                    }`}>
                      {tipo === 'expense' ? '−' : '+'}{fmt.money(c.total)}
                    </p>
                    <Flecha className="w-4 h-4 text-slate-600 flex-shrink-0" />
                  </div>
                  {/* La barra repite la proporción a lo largo, donde sí se pueden
                      comparar dos categorías parecidas: en el anillo no se puede. */}
                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden mt-2">
                    <div className="h-full rounded-full" style={{ width: `${c.porcentaje}%`, backgroundColor: color }} />
                  </div>
                </Link>
              );
            })}
          </div>

          <p className="text-xs text-slate-500 text-center">
            Tocá una categoría para ver sus movimientos del mes.
          </p>
        </>
      )}
    </div>
  );
}
