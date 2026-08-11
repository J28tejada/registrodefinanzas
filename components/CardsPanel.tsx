'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CreditCard, Plus, Pencil, Trash2, Check, X, Loader2, AlertCircle,
  Archive, ArchiveRestore, ChevronDown,
} from 'lucide-react';
import { useFormatters } from './SettingsContext';
import { CardKind, CardWithUsage, CARD_KIND_LABEL, LedgerColor, LEDGER_COLOR_MAP } from '@/lib/types';

const TIPOS: CardKind[] = ['credit', 'debit', 'cash', 'transfer', 'other'];
const COLORES = Object.keys(LEDGER_COLOR_MAP) as LedgerColor[];

interface Borrador {
  name: string;
  kind: CardKind;
  last4: string;
  issuer: string;
  color: LedgerColor;
}

const VACIO: Borrador = { name: '', kind: 'credit', last4: '', issuer: '', color: 'blue' };

/**
 * Tarjetas y medios de pago: crear, editar, archivar y borrar.
 *
 * Archivar y borrar no son lo mismo y la diferencia importa: una tarjeta usada
 * por movimientos no se puede borrar sin perder con qué se pagó cada uno, pero
 * sí sacarla del desplegable cuando se vence o se cancela. Por eso cada fila
 * muestra en cuántos movimientos se usa.
 */
export default function CardsPanel() {
  const fmt = useFormatters();

  const [cards, setCards] = useState<CardWithUsage[]>([]);
  const [cargando, setCargando] = useState(true);
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const [creando, setCreando] = useState(false);
  const [borrador, setBorrador] = useState<Borrador>(VACIO);
  const [editando, setEditando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch(`/api/cards${verArchivadas ? '?archivadas=1' : ''}`);
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudieron cargar'); return; }
      setCards(datos.cards ?? []);
      setError('');
    } catch {
      setError('No se pudieron cargar las tarjetas');
    } finally {
      setCargando(false);
    }
  }, [verArchivadas]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async () => {
    const name = borrador.name.trim();
    if (!name) return;
    setOcupado(true);
    setError('');
    try {
      const url = editando ? `/api/cards/${editando}` : '/api/cards';
      const res = await fetch(url, {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...borrador, name }),
      });
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudo guardar'); return; }
      await cargar();
      cerrar();
    } finally {
      setOcupado(false);
    }
  };

  const cerrar = () => { setCreando(false); setEditando(null); setBorrador(VACIO); };

  const abrirEdicion = (c: CardWithUsage) => {
    setBorrador({ name: c.name, kind: c.kind, last4: c.last4, issuer: c.issuer, color: c.color });
    setEditando(c.id);
    setCreando(false);
    setError('');
  };

  const archivar = async (c: CardWithUsage) => {
    setError('');
    await fetch(`/api/cards/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: !c.archived }),
    });
    await cargar();
  };

  const eliminar = async (c: CardWithUsage) => {
    if (!confirm(`¿Eliminar ${c.name}?`)) return;
    setError('');
    const res = await fetch(`/api/cards/${c.id}`, { method: 'DELETE' });
    if (!res.ok) { setError((await res.json()).error ?? 'No se pudo eliminar'); return; }
    await cargar();
  };

  const formulario = (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
      <input
        type="text"
        value={borrador.name}
        onChange={e => setBorrador(b => ({ ...b, name: e.target.value }))}
        placeholder="Nombre — ej: Visa Popular"
        autoFocus
        maxLength={40}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="relative min-w-0">
          <select
            value={borrador.kind}
            onChange={e => setBorrador(b => ({ ...b, kind: e.target.value as CardKind }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-8 text-sm text-white focus:outline-none focus:border-emerald-500 appearance-none"
          >
            {TIPOS.map(t => <option key={t} value={t}>{CARD_KIND_LABEL[t]}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        <input
          type="text"
          inputMode="numeric"
          value={borrador.last4}
          onChange={e => setBorrador(b => ({ ...b, last4: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
          placeholder="Últimos 4"
          className="min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
        />
      </div>
      <input
        type="text"
        value={borrador.issuer}
        onChange={e => setBorrador(b => ({ ...b, issuer: e.target.value }))}
        placeholder="Banco (opcional)"
        maxLength={40}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
      />
      <div className="flex flex-wrap gap-1.5">
        {COLORES.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => setBorrador(b => ({ ...b, color: c }))}
            aria-label={`Color ${c}`}
            className={`w-6 h-6 rounded-md transition-transform ${borrador.color === c ? 'ring-2 ring-white scale-110' : ''}`}
            style={{ background: `linear-gradient(to right, ${LEDGER_COLOR_MAP[c].dark} 35%, ${LEDGER_COLOR_MAP[c].main} 35%)` }}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={cerrar}
          className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5"
        >
          <X className="w-4 h-4" /> Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={ocupado || !borrador.name.trim()}
          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
        >
          {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Guardar
        </button>
      </div>
    </div>
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-400 flex-shrink-0" /> Tarjetas y medios de pago
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Aparecen al registrar un movimiento, y podés ver cuánto va por cada una.
          </p>
        </div>
        {!creando && editando === null && (
          <button
            onClick={() => { setCreando(true); setBorrador(VACIO); setError(''); }}
            className="p-2 bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white rounded-lg transition-colors flex-shrink-0"
            aria-label="Agregar una tarjeta"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {error && (
        <p className="flex items-start gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> <span>{error}</span>
        </p>
      )}

      {creando && formulario}

      {cargando ? (
        <div className="h-16 bg-slate-800/50 rounded-xl animate-pulse" />
      ) : cards.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          {verArchivadas ? 'No hay archivadas.' : 'Todavía no cargaste ninguna. Agregá la primera con el +.'}
        </p>
      ) : (
        <div className="space-y-2">
          {cards.map(c => editando === c.id ? (
            <div key={c.id}>{formulario}</div>
          ) : (
            <div key={c.id} className="bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2.5 flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-md flex-shrink-0"
                style={{ background: `linear-gradient(to right, ${LEDGER_COLOR_MAP[c.color]?.dark ?? '#334155'} 35%, ${LEDGER_COLOR_MAP[c.color]?.main ?? '#475569'} 35%)` }}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">
                  {c.name}
                  {c.last4 && <span className="text-slate-500"> ···· {c.last4}</span>}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {CARD_KIND_LABEL[c.kind]}
                  {c.issuer && ` · ${c.issuer}`}
                  {c.usos > 0 && ` · ${c.usos} mov.`}
                  {c.archived && ' · archivada'}
                </p>
              </div>
              {/* El gasto del mes es lo que se viene a mirar acá. */}
              <p className="text-sm text-slate-300 flex-shrink-0 tabular-nums">
                {fmt.money(c.gastoDelMes)}
              </p>
              <div className="flex flex-shrink-0">
                <button
                  onClick={() => abrirEdicion(c)}
                  className="p-1.5 text-slate-400 hover:text-emerald-400 rounded-lg transition-colors"
                  aria-label={`Editar ${c.name}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => archivar(c)}
                  className="p-1.5 text-slate-400 hover:text-amber-400 rounded-lg transition-colors"
                  aria-label={c.archived ? `Restaurar ${c.name}` : `Archivar ${c.name}`}
                >
                  {c.archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                </button>
                {/* Solo si no la usa nadie: con movimientos anotados, borrar
                    perdería con qué se pagó cada uno. Ahí el camino es archivar. */}
                {c.usos === 0 && (
                  <button
                    onClick={() => eliminar(c)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                    aria-label={`Eliminar ${c.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setVerArchivadas(v => !v)}
        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        {verArchivadas ? 'Ver solo las activas' : 'Ver también las archivadas'}
      </button>
    </div>
  );
}
