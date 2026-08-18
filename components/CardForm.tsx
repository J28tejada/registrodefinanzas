'use client';

import { useState } from 'react';
import { Bell, Check, ChevronDown, Loader2, X } from 'lucide-react';
import {
  Card, CardKind, CARD_GROUPS, CARD_KIND_LABEL, LedgerColor, LEDGER_COLOR_MAP,
  etiquetaUltimosDigitos, llevaSaldo,
} from '@/lib/types';


const COLORES = Object.keys(LEDGER_COLOR_MAP) as LedgerColor[];

interface Borrador {
  name: string;
  kind: CardKind;
  last4: string;
  issuer: string;
  color: LedgerColor;
  /** Los del ciclo van como texto: un campo vacío no es cero, es "sin poner". */
  credit_limit: string;
  statement_day: string;
  due_day: string;
  opening_balance: string;
  opening_date: string;
  alerts: boolean;
}

const VACIO: Borrador = {
  name: '', kind: 'credit', last4: '', issuer: '', color: 'blue',
  credit_limit: '', statement_day: '', due_day: '',
  opening_balance: '', opening_date: '', alerts: true,
};

/** Texto a número, o null si quedó vacío. Vacío significa "sin configurar". */
function oNulo(valor: string): number | null {
  const limpio = valor.trim();
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

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
      ? {
          name: card.name, kind: card.kind, last4: card.last4,
          issuer: card.issuer, color: card.color,
          credit_limit: card.credit_limit != null ? String(card.credit_limit) : '',
          statement_day: card.statement_day != null ? String(card.statement_day) : '',
          due_day: card.due_day != null ? String(card.due_day) : '',
          // El saldo inicial en cero no se muestra: es el valor por defecto y
          // llenarlo con un "0" hace parecer que se configuró algo.
          opening_balance: card.opening_balance ? String(card.opening_balance) : '',
          opening_date: card.opening_date ?? '',
          alerts: card.alerts,
        }
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
      // Solo las de crédito llevan ciclo. Si se cambió el tipo, los campos se
      // mandan en null para que no quede un día de corte colgado en una tarjeta
      // de débito.
      const deCredito = llevaSaldo(borrador);
      const res = await fetch(card ? `/api/cards/${card.id}` : '/api/cards', {
        method: card ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          kind: borrador.kind,
          last4: borrador.last4,
          issuer: borrador.issuer,
          color: borrador.color,
          credit_limit: deCredito ? oNulo(borrador.credit_limit) : null,
          statement_day: deCredito ? oNulo(borrador.statement_day) : null,
          due_day: deCredito ? oNulo(borrador.due_day) : null,
          opening_balance: deCredito ? oNulo(borrador.opening_balance) ?? 0 : 0,
          opening_date: deCredito ? borrador.opening_date || null : null,
          alerts: deCredito ? borrador.alerts : true,
        }),
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

      {/* Lo propio de una tarjeta de crédito: el cupo y el ciclo. Solo acá,
          porque el efectivo y una cuenta de ahorro no deben nada ni tienen
          fecha de corte. Todo opcional: la tarjeta se puede cargar hoy y
          configurarse después. */}
      {llevaSaldo(borrador) && (
        <div className="border border-slate-800 rounded-xl p-3 space-y-2.5 bg-slate-950/40">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Saldo y ciclo
          </p>

          <div className="space-y-1">
            <label className="text-xs text-slate-500">Límite de crédito</label>
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={borrador.credit_limit}
              onChange={e => setBorrador(b => ({ ...b, credit_limit: e.target.value }))}
              placeholder="Opcional — para ver cuánto llevás consumido"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1 min-w-0">
              <label className="text-xs text-slate-500">Día de corte</label>
              <input
                type="number" min="1" max="31" step="1" inputMode="numeric"
                value={borrador.statement_day}
                onChange={e => setBorrador(b => ({ ...b, statement_day: e.target.value }))}
                placeholder="25"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1 min-w-0">
              <label className="text-xs text-slate-500">Día de pago</label>
              <input
                type="number" min="1" max="31" step="1" inputMode="numeric"
                value={borrador.due_day}
                onChange={e => setBorrador(b => ({ ...b, due_day: e.target.value }))}
                placeholder="10"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Si el día de pago es anterior al de corte, se entiende que vence el mes
            siguiente. En los meses cortos se corre al último día.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1 min-w-0">
              <label className="text-xs text-slate-500">Ya debías</label>
              <input
                type="number" min="0" step="0.01" inputMode="decimal"
                value={borrador.opening_balance}
                onChange={e => setBorrador(b => ({ ...b, opening_balance: e.target.value }))}
                placeholder="0"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1 min-w-0">
              <label className="text-xs text-slate-500">Desde</label>
              <input
                type="date"
                value={borrador.opening_date}
                onChange={e => setBorrador(b => ({ ...b, opening_date: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Lo que ya debías cuando empezaste a seguirla acá. Los movimientos
            anteriores a esa fecha no se suman: ya están adentro de ese monto.
          </p>

          <label className="flex items-start gap-2 cursor-pointer pt-0.5">
            <input
              type="checkbox"
              checked={borrador.alerts}
              onChange={e => setBorrador(b => ({ ...b, alerts: e.target.checked }))}
              className="mt-0.5 accent-emerald-500"
            />
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              Avisarme tres días antes del corte y del pago
            </span>
          </label>
        </div>
      )}

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
