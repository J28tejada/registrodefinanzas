'use client';

import { useState } from 'react';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import {
  Card, CardKind, CARD_GROUPS, CARD_KIND_LABEL, LedgerColor, LEDGER_COLOR_MAP,
  etiquetaUltimosDigitos,
} from '@/lib/types';


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
 * Alta y edición de una tarjeta, con el mismo formulario en los dos casos.
 *
 * Guarda por su cuenta y avisa cuando terminó: los dos lugares que lo usan
 * —la lista y el detalle— hacen exactamente lo mismo después, que es recargar.
 */
export default function CardForm({
  card, onListo, onCancelar,
}: {
  /** Presente = edición. Ausente = alta. */
  card?: Card;
  onListo: () => void | Promise<void>;
  onCancelar: () => void;
}) {
  const [borrador, setBorrador] = useState<Borrador>(
    card
      ? { name: card.name, kind: card.kind, last4: card.last4, issuer: card.issuer, color: card.color }
      : VACIO,
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    const name = borrador.name.trim();
    if (!name) return;
    setGuardando(true);
    setError('');
    try {
      const res = await fetch(card ? `/api/cards/${card.id}` : '/api/cards', {
        method: card ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...borrador, name }),
      });
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudo guardar'); return; }
      await onListo();
    } catch {
      setError('No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-2.5">
      <p className="text-sm font-medium text-slate-300">
        {card ? 'Editar medio de pago' : 'Nuevo medio de pago'}
      </p>

      <input
        type="text"
        value={borrador.name}
        onChange={e => setBorrador(b => ({ ...b, name: e.target.value }))}
        placeholder="Nombre — ej: Visa Popular, Ahorros BHD"
        autoFocus
        maxLength={40}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
      />

      <div className="grid grid-cols-2 gap-2">
        <div className="relative min-w-0">
          <select
            value={borrador.kind}
            onChange={e => setBorrador(b => ({ ...b, kind: e.target.value as CardKind }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 pr-8 text-sm text-white focus:outline-none focus:border-emerald-500 appearance-none"
          >
            {/* Agrupado: con siete tipos sueltos hay que leerlos todos para
                encontrar "Cuenta de ahorro" entre las tarjetas. */}
            {CARD_GROUPS.map(({ titulo, kinds }) => (
              <optgroup key={titulo} label={titulo}>
                {kinds.map(t => <option key={t} value={t}>{CARD_KIND_LABEL[t]}</option>)}
              </optgroup>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        <input
          type="text"
          inputMode="numeric"
          value={borrador.last4}
          onChange={e => setBorrador(b => ({ ...b, last4: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
          placeholder={etiquetaUltimosDigitos(borrador.kind)}
          className="min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
        />
      </div>

      <input
        type="text"
        value={borrador.issuer}
        onChange={e => setBorrador(b => ({ ...b, issuer: e.target.value }))}
        placeholder={borrador.kind === 'checking' || borrador.kind === 'savings'
          ? 'Banco'
          : 'Banco (opcional)'}
        maxLength={40}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
      />

      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {COLORES.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => setBorrador(b => ({ ...b, color: c }))}
            aria-label={`Color ${c}`}
            className={`w-7 h-7 rounded-md transition-transform ${borrador.color === c ? 'ring-2 ring-white scale-110' : ''}`}
            style={{ background: `linear-gradient(to right, ${LEDGER_COLOR_MAP[c].dark} 35%, ${LEDGER_COLOR_MAP[c].main} 35%)` }}
          />
        ))}
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex gap-2 pt-0.5">
        <button
          onClick={onCancelar}
          className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5"
        >
          <X className="w-4 h-4" /> Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={guardando || !borrador.name.trim()}
          className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
        >
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Guardar
        </button>
      </div>
    </div>
  );
}
