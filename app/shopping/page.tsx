'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShoppingCart, Plus, Loader2, AlertCircle, ChevronRight, Check, ClipboardList, ChevronDown,
} from 'lucide-react';
import { useFormatters } from '@/components/SettingsContext';
import { useLedger } from '@/components/LedgerContext';
import { ShoppingListWithTotals, ShoppingTripWithTotals } from '@/lib/types';

/**
 * Dos cosas separadas en una pantalla, y el orden importa.
 *
 * Arriba la COMPRA, que es lo que se hace parado en el súper con el teléfono en
 * una mano. Abajo las LISTAS, que son las plantillas y se editan sentado en
 * casa. Mezclarlas era el error anterior: corregir un precio en la góndola
 * reescribía la referencia justo cuando se la estaba usando.
 */
export default function ShoppingPage() {
  const fmt = useFormatters();
  const router = useRouter();
  const { currentLedger, ledgers } = useLedger();

  const [trips, setTrips] = useState<ShoppingTripWithTotals[]>([]);
  const [lists, setLists] = useState<ShoppingListWithTotals[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [verCerradas, setVerCerradas] = useState(false);

  const [iniciando, setIniciando] = useState(false);
  const [creandoLista, setCreandoLista] = useState(false);
  const [nombreLista, setNombreLista] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cuentaId = currentLedger?.id ?? ledgers[0]?.id ?? null;

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const p = new URLSearchParams();
      if (currentLedger) p.set('ledger_id', currentLedger.id);
      const pt = new URLSearchParams(p);
      if (verCerradas) pt.set('cerradas', '1');

      const [rt, rl] = await Promise.all([
        fetch(`/api/trips?${pt}`),
        fetch(`/api/shopping?${p}`),
      ]);
      const [dt, dl] = await Promise.all([rt.json(), rl.json()]);
      if (!rt.ok) { setError(dt.error ?? 'No se pudieron cargar las compras'); return; }
      setTrips(dt.trips ?? []);
      setLists(rl.ok ? dl.lists ?? [] : []);
      setError('');
    } catch {
      setError('No se pudo cargar');
    } finally {
      setCargando(false);
    }
  }, [currentLedger, verCerradas]);

  useEffect(() => { cargar(); }, [cargar]);

  const crearLista = async () => {
    const name = nombreLista.trim();
    if (!name) return;
    setGuardando(true);
    setError('');
    try {
      const res = await fetch('/api/shopping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ledger_id: cuentaId }),
      });
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudo crear'); return; }
      setNombreLista('');
      setCreandoLista(false);
      router.push(`/shopping/lista/${datos.id}`);
    } finally {
      setGuardando(false);
    }
  };

  const enCurso = trips.filter(t => !t.closed);
  const cerradas = trips.filter(t => t.closed);

  return (
    <div className="max-w-2xl mx-auto space-y-5 pt-14 md:pt-0">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-white">Supermercado</h1>
        <p className="text-slate-400 text-sm truncate">
          Las listas son la plantilla; la compra es lo que pasó de verdad
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── La compra ── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-white flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-emerald-400 flex-shrink-0" /> Compras
          </h2>
          {!iniciando && (
            <button
              onClick={() => setIniciando(true)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> Ir al súper
            </button>
          )}
        </div>

        {iniciando && (
          <IniciarCompra
            listas={lists}
            cuentaId={cuentaId}
            onCancelar={() => setIniciando(false)}
            onCreada={id => router.push(`/shopping/compra/${id}`)}
          />
        )}

        {cargando ? (
          <div className="h-20 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
        ) : enCurso.length === 0 && cerradas.length === 0 ? (
          <p className="text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-6 text-center">
            Ninguna compra todavía. Cuando vayas al súper, arrancá una desde una lista.
          </p>
        ) : (
          <>
            {enCurso.map(t => <TarjetaCompra key={t.id} compra={t} fmt={fmt} />)}
            {cerradas.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Ya compradas</p>
                {cerradas.map(t => <TarjetaCompra key={t.id} compra={t} fmt={fmt} />)}
              </div>
            )}
          </>
        )}

        <button
          onClick={() => setVerCerradas(v => !v)}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          {verCerradas ? 'Ver solo las que están en curso' : 'Ver también las ya compradas'}
        </button>
      </section>

      {/* ── Las plantillas ── */}
      <section className="space-y-2 pt-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-white flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-slate-400 flex-shrink-0" /> Mis listas
          </h2>
          {!creandoLista && (
            <button
              onClick={() => setCreandoLista(true)}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors flex-shrink-0"
              aria-label="Crear una lista"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Lo que solés comprar, con precios de referencia. No se ensucian al ir al súper.
        </p>

        {creandoLista && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2">
            <input
              type="text"
              value={nombreLista}
              onChange={e => setNombreLista(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') crearLista(); }}
              placeholder="Nombre — ej: Compra de la quincena"
              autoFocus
              maxLength={60}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setCreandoLista(false); setNombreLista(''); }}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={crearLista}
                disabled={guardando || !nombreLista.trim()}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Crear
              </button>
            </div>
          </div>
        )}

        {!cargando && lists.length === 0 && !creandoLista && (
          <p className="text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-6 text-center">
            Todavía no tenés ninguna lista.
          </p>
        )}

        {lists.map(l => (
          <Link
            key={l.id}
            href={`/shopping/lista/${l.id}`}
            className="block bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl px-4 py-3 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{l.name}</p>
                <p className="text-xs text-slate-500">
                  {l.items} {l.items === 1 ? 'artículo' : 'artículos'}
                </p>
              </div>
              <p className="text-sm text-slate-400 flex-shrink-0 tabular-nums">{fmt.money(l.total)}</p>
              <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}

// ─── Arrancar una compra ──────────────────────────────────────────────────────

function IniciarCompra({
  listas, cuentaId, onCancelar, onCreada,
}: {
  listas: ShoppingListWithTotals[];
  cuentaId: string | null;
  onCancelar: () => void;
  onCreada: (id: string) => void;
}) {
  const [listaId, setListaId] = useState(listas[0]?.id ?? '');
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const arrancar = async () => {
    setGuardando(true);
    setError('');
    try {
      const elegida = listas.find(l => l.id === listaId);
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Sin nombre propio hereda el de la lista: nadie quiere escribir un
          // título cuando ya está entrando al supermercado.
          name: nombre.trim() || elegida?.name || 'Compra',
          ledger_id: cuentaId,
          list_id: listaId || null,
        }),
      });
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudo iniciar'); return; }
      onCreada(datos.id);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4 space-y-3">
      <p className="text-sm font-medium text-white">Empezar una compra</p>

      <div className="space-y-1">
        <label className="text-xs text-slate-500">Desde qué lista</label>
        <div className="relative">
          <select
            value={listaId}
            onChange={e => setListaId(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 pr-8 text-sm text-white focus:outline-none focus:border-emerald-500 appearance-none"
          >
            <option value="">Empezar en blanco</option>
            {listas.map(l => (
              <option key={l.id} value={l.id}>{l.name} · {l.items} art.</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        <p className="text-xs text-slate-500">
          Se copian sus artículos. Lo que cambies acá no toca la lista.
        </p>
      </div>

      <input
        type="text"
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        placeholder="Nombre de la compra (opcional)"
        maxLength={60}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
      />

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={onCancelar}
          className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={arrancar}
          disabled={guardando}
          className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
          Empezar
        </button>
      </div>
    </div>
  );
}

function TarjetaCompra({
  compra, fmt,
}: {
  compra: ShoppingTripWithTotals;
  fmt: { money: (n: number) => string };
}) {
  const avance = compra.total > 0 ? Math.round((compra.checkedTotal / compra.total) * 100) : 0;
  const pagado = compra.closed && compra.paid_amount != null ? compra.paid_amount : compra.checkedTotal;
  const desvio = compra.closed ? pagado - compra.plannedTotal : 0;

  return (
    <Link
      href={`/shopping/compra/${compra.id}`}
      className="block bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl px-4 py-3.5 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          compra.closed ? 'bg-slate-800' : 'bg-emerald-500/10'
        }`}>
          {compra.closed
            ? <Check className="w-4 h-4 text-slate-400" />
            : <ShoppingCart className="w-4 h-4 text-emerald-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{compra.name}</p>
          <p className="text-xs text-slate-500">
            {compra.checkedItems} de {compra.items} artículos · {compra.date}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-white tabular-nums">{fmt.money(pagado)}</p>
          {/* Cerrada: lo pagado contra lo que decía la lista. Es el dato que
              se viene a buscar después. */}
          {compra.closed && Math.abs(desvio) >= 0.01 && compra.plannedTotal > 0 && (
            <p className={`text-[11px] tabular-nums ${desvio > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {desvio > 0 ? '+' : '−'}{fmt.money(Math.abs(desvio))} vs lista
            </p>
          )}
          {!compra.closed && compra.total !== compra.checkedTotal && (
            <p className="text-[11px] text-slate-500 tabular-nums">de {fmt.money(compra.total)}</p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
      </div>

      {!compra.closed && compra.items > 0 && (
        <div className="h-1 bg-slate-800 rounded-full overflow-hidden mt-2.5">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(avance, 100)}%` }} />
        </div>
      )}
    </Link>
  );
}
