'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, Plus, Loader2, AlertCircle, ChevronRight, Check } from 'lucide-react';
import { useFormatters } from '@/components/SettingsContext';
import { useLedger } from '@/components/LedgerContext';
import { ShoppingListWithTotals } from '@/lib/types';

export default function ShoppingPage() {
  const fmt = useFormatters();
  const { currentLedger, ledgers } = useLedger();

  const [lists, setLists] = useState<ShoppingListWithTotals[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [verCerradas, setVerCerradas] = useState(false);

  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (currentLedger) params.set('ledger_id', currentLedger.id);
      if (verCerradas) params.set('cerradas', '1');
      const res = await fetch(`/api/shopping?${params}`);
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudieron cargar las listas'); return; }
      setLists(datos.lists ?? []);
      setError('');
    } catch {
      setError('No se pudieron cargar las listas');
    } finally {
      setCargando(false);
    }
  }, [currentLedger, verCerradas]);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = async () => {
    const name = nombre.trim();
    if (!name) return;
    setGuardando(true);
    setError('');
    try {
      const res = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ledger_id: currentLedger?.id ?? ledgers[0]?.id ?? null }),
      });
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudo crear'); return; }
      setNombre('');
      setCreando(false);
      await cargar();
    } finally {
      setGuardando(false);
    }
  };

  const abiertas = lists.filter(l => !l.closed);
  const cerradas = lists.filter(l => l.closed);

  return (
    <div className="max-w-2xl mx-auto space-y-5 pt-14 md:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white">Lista de compras</h1>
          <p className="text-slate-400 text-sm truncate">
            Armá el gasto del súper antes de hacerlo
          </p>
        </div>
        <button
          onClick={() => setCreando(v => !v)}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5 flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nueva</span>
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {creando && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <input
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') crear(); }}
            placeholder="Nombre — ej: Compra de la quincena"
            autoFocus
            maxLength={60}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
          <p className="text-xs text-slate-500">
            Se crea en {currentLedger?.name ?? ledgers[0]?.name ?? 'tu cuenta'}. Si la cuenta es
            compartida, la ve y la tilda quien vaya al súper.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { setCreando(false); setNombre(''); }}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={crear}
              disabled={guardando || !nombre.trim()}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Crear
            </button>
          </div>
        </div>
      )}

      {cargando ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : lists.length === 0 ? (
        <div className="text-center py-12 text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
          <ShoppingCart className="w-8 h-8 mx-auto mb-3 text-slate-600" />
          <p className="text-sm">Todavía no tenés ninguna lista.</p>
          <p className="text-xs mt-1">Armá una y andá tildando en el súper.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {abiertas.map(l => <Tarjeta key={l.id} lista={l} fmt={fmt} />)}

          {cerradas.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Ya compradas</p>
              {cerradas.map(l => <Tarjeta key={l.id} lista={l} fmt={fmt} />)}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setVerCerradas(v => !v)}
        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        {verCerradas ? 'Ver solo las pendientes' : 'Ver también las ya compradas'}
      </button>
    </div>
  );
}

function Tarjeta({
  lista, fmt,
}: {
  lista: ShoppingListWithTotals;
  fmt: { money: (n: number) => string; dateLabel?: (iso: string) => string };
}) {
  const avance = lista.total > 0 ? Math.round((lista.checkedTotal / lista.total) * 100) : 0;

  return (
    <Link
      href={`/shopping/${lista.id}`}
      className="block bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl px-4 py-3.5 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          lista.closed ? 'bg-slate-800' : 'bg-emerald-500/10'
        }`}>
          {lista.closed
            ? <Check className="w-4 h-4 text-slate-400" />
            : <ShoppingCart className="w-4 h-4 text-emerald-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{lista.name}</p>
          <p className="text-xs text-slate-500">
            {lista.checkedItems} de {lista.items} artículos · {lista.date}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-white tabular-nums">{fmt.money(lista.checkedTotal)}</p>
          {!lista.closed && lista.total !== lista.checkedTotal && (
            <p className="text-[11px] text-slate-500 tabular-nums">de {fmt.money(lista.total)}</p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
      </div>

      {!lista.closed && lista.items > 0 && (
        <div className="h-1 bg-slate-800 rounded-full overflow-hidden mt-2.5">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(avance, 100)}%` }} />
        </div>
      )}
    </Link>
  );
}
