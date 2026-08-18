'use client';

import { useState } from 'react';
import { Bell, CalendarClock, Loader2, Scissors, Trash2, X } from 'lucide-react';
import { budgetTone } from './BudgetBar';
import { useFormatters } from './SettingsContext';
import { Card, CardBalance, CardPayment } from '@/lib/types';

/**
 * El estado de cuenta de una tarjeta de crédito: cuánto se debe, cuánto queda
 * del cupo y cuándo cierra y vence.
 *
 * Acá vive la respuesta a "¿por qué mi gasto no baja cuando le pago a la
 * tarjeta?": el pago se registra en este bloque y baja el saldo, sin tocar los
 * movimientos del mes. La compra ya se anotó el día que se hizo.
 */
export default function CardStatement({
  card, balance, payments, mediosDePago, onCambio,
}: {
  card: Card;
  balance: CardBalance;
  payments: CardPayment[];
  /** Los otros medios de pago, para decir de dónde salió la plata. */
  mediosDePago: { id: string; name: string }[];
  onCambio: () => void | Promise<void>;
}) {
  const fmt = useFormatters();
  const [pagando, setPagando] = useState(false);

  const { ciclo } = balance;
  const sinConfigurar = card.credit_limit == null && ciclo == null;

  // La barra usa la misma escala que los presupuestos: ámbar al 80% del cupo,
  // rojo al llegar. Es la misma pregunta —cuánto falta para el techo— y tener
  // dos escalas distintas obligaría a aprenderse cuál es cuál.
  const uso = balance.usoDelLimite ?? 0;
  const tono = budgetTone(uso);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-white">Estado de cuenta</p>
        {card.alerts && ciclo && (
          <span className="flex items-center gap-1 text-[11px] text-slate-500 flex-shrink-0">
            <Bell className="w-3 h-3" /> avisos activos
          </span>
        )}
      </div>

      {/* El saldo, que es a lo que se viene. */}
      <div>
        <p className="text-[11px] sm:text-xs text-slate-400 uppercase tracking-wider">
          {balance.saldo < 0 ? 'A favor' : 'Debés'}
        </p>
        <p className={`text-2xl sm:text-3xl font-bold mt-1 ${balance.saldo > 0 ? 'text-white' : 'text-emerald-400'}`}>
          {fmt.money(Math.abs(balance.saldo))}
        </p>
      </div>

      {/* Cuánto del cupo va consumido. Sin límite cargado no hay contra qué
          medir, y una barra sin escala no dice nada. */}
      {card.credit_limit != null ? (
        <div className="space-y-1.5">
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${tono.bar}`}
              style={{ width: `${Math.min(uso, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className={tono.text}>{Math.round(uso)}% del límite</span>
            <span className="text-slate-500 tabular-nums">
              {balance.disponible != null && balance.disponible >= 0
                ? `${fmt.money(balance.disponible)} disponibles`
                : `${fmt.money(Math.abs(balance.disponible ?? 0))} por encima del límite`}
              <span className="text-slate-600"> de {fmt.money(card.credit_limit)}</span>
            </span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          Cargale el límite en «Editar» para ver cuánto llevás consumido.
        </p>
      )}

      {/* Las dos fechas del ciclo. */}
      {ciclo ? (
        <div className="grid grid-cols-2 gap-2">
          <Fecha
            icono={<Scissors className="w-3.5 h-3.5" />}
            titulo="Corte"
            fecha={fmt.date(ciclo.nextStatement)}
            dias={ciclo.daysToStatement}
          />
          <Fecha
            icono={<CalendarClock className="w-3.5 h-3.5" />}
            titulo="Pago"
            fecha={fmt.date(ciclo.nextDue)}
            dias={ciclo.daysToDue}
            urgente={ciclo.daysToDue <= 3}
          />
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          Poné el día de corte y el de pago en «Editar» y te aviso tres días antes
          de cada uno.
        </p>
      )}

      {/* Lo facturado contra lo que todavía no cerró: son dos plata distintas y
          confundirlas es pagar de menos. */}
      {ciclo && (
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
          <div className="min-w-0 pt-3">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">A pagar</p>
            <p className="text-base font-semibold text-white mt-0.5 truncate">
              {fmt.money(balance.aPagar)}
            </p>
            <p className="text-[11px] text-slate-500">ya facturado</p>
          </div>
          <div className="min-w-0 pt-3">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Este ciclo</p>
            <p className="text-base font-semibold text-slate-300 mt-0.5 truncate">
              {fmt.money(balance.cycleCharged)}
            </p>
            <p className="text-[11px] text-slate-500">entra en el próximo corte</p>
          </div>
        </div>
      )}

      {sinConfigurar && (
        <p className="text-xs text-slate-500 bg-slate-800/50 rounded-lg px-3 py-2">
          El saldo ya se lleva solo: cada compra que anotes con esta tarjeta lo
          sube, y cada pago que registres acá lo baja.
        </p>
      )}

      {/* Registrar un pago: la pieza que evita el doble conteo. */}
      {pagando ? (
        <FormularioDePago
          cardId={card.id}
          sugerido={balance.aPagar > 0 ? balance.aPagar : Math.max(balance.saldo, 0)}
          hoy={fmt.today()}
          mediosDePago={mediosDePago}
          onListo={async () => { setPagando(false); await onCambio(); }}
          onCancelar={() => setPagando(false)}
        />
      ) : (
        <button
          onClick={() => setPagando(true)}
          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Registrar un pago
        </button>
      )}

      <p className="text-[11px] text-slate-500 leading-relaxed">
        Pagarle a la tarjeta no es un gasto nuevo: la compra ya se anotó el día que
        la hiciste. Por eso el pago baja este saldo y no aparece en los movimientos
        del mes — si no, la misma plata contaría dos veces.
      </p>

      {payments.length > 0 && (
        <ListaDePagos
          payments={payments}
          cardId={card.id}
          mediosDePago={mediosDePago}
          onCambio={onCambio}
        />
      )}
    </div>
  );
}

/** Una de las dos fechas del ciclo, con cuánto falta. */
function Fecha({
  icono, titulo, fecha, dias, urgente,
}: {
  icono: React.ReactNode;
  titulo: string;
  fecha: string;
  dias: number;
  urgente?: boolean;
}) {
  return (
    <div className={`rounded-xl px-3 py-2.5 border min-w-0 ${urgente ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-800/50 border-slate-800'}`}>
      <p className="flex items-center gap-1.5 text-[11px] text-slate-400 uppercase tracking-wider">
        {icono} {titulo}
      </p>
      <p className="text-sm font-semibold text-white mt-1 truncate">{fecha}</p>
      <p className={`text-[11px] ${urgente ? 'text-amber-400' : 'text-slate-500'}`}>
        {dias === 0 ? 'es hoy' : dias === 1 ? 'mañana' : `en ${dias} días`}
      </p>
    </div>
  );
}

function FormularioDePago({
  cardId, sugerido, hoy, mediosDePago, onListo, onCancelar,
}: {
  cardId: string;
  sugerido: number;
  hoy: string;
  mediosDePago: { id: string; name: string }[];
  onListo: () => void | Promise<void>;
  onCancelar: () => void;
}) {
  // Se sugiere lo que hay que pagar, pero se puede pisar: pagar el mínimo o de
  // más son las dos cosas más comunes.
  const [monto, setMonto] = useState(sugerido > 0 ? sugerido.toFixed(2) : '');
  const [fecha, setFecha] = useState(hoy);
  const [origen, setOrigen] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      const res = await fetch(`/api/cards/${cardId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(monto),
          date: fecha,
          source_card_id: origen || null,
        }),
      });
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudo registrar el pago'); return; }
      await onListo();
    } catch {
      setError('No se pudo registrar el pago');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="border border-slate-800 rounded-xl p-3 space-y-2.5 bg-slate-950/40">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Pago a la tarjeta</p>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1 min-w-0">
          <label className="text-xs text-slate-500">Monto</label>
          <input
            type="number" min="0" step="0.01" inputMode="decimal"
            value={monto} onChange={e => setMonto(e.target.value)} autoFocus
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div className="space-y-1 min-w-0">
          <label className="text-xs text-slate-500">Fecha</label>
          <input
            type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {mediosDePago.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs text-slate-500">De dónde salió (opcional)</label>
          <select
            value={origen} onChange={e => setOrigen(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="">Sin especificar</option>
            {mediosDePago.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      )}

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={onCancelar}
          className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5"
        >
          <X className="w-4 h-4" /> Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={guardando || !(Number(monto) > 0)}
          className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
        >
          {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
          Guardar pago
        </button>
      </div>
    </div>
  );
}

function ListaDePagos({
  payments, cardId, mediosDePago, onCambio,
}: {
  payments: CardPayment[];
  cardId: string;
  mediosDePago: { id: string; name: string }[];
  onCambio: () => void | Promise<void>;
}) {
  const fmt = useFormatters();
  const [borrando, setBorrando] = useState<string | null>(null);
  const nombres = new Map(mediosDePago.map(m => [m.id, m.name]));

  const borrar = async (pagoId: string) => {
    if (!confirm('¿Eliminar este pago? El saldo vuelve a subir.')) return;
    setBorrando(pagoId);
    try {
      await fetch(`/api/cards/${cardId}/payments?payment_id=${pagoId}`, { method: 'DELETE' });
      await onCambio();
    } finally {
      setBorrando(null);
    }
  };

  return (
    <div className="space-y-2 pt-1 border-t border-slate-800">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider pt-3">
        Pagos · {payments.length}
      </p>
      {payments.map(p => (
        <div key={p.id} className="flex items-center gap-3 bg-slate-800/40 rounded-lg px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white tabular-nums">{fmt.money(p.amount)}</p>
            <p className="text-[11px] text-slate-500 truncate">
              {fmt.date(p.date)}
              {p.source_card_id && nombres.has(p.source_card_id) && ` · desde ${nombres.get(p.source_card_id)}`}
            </p>
          </div>
          <button
            onClick={() => borrar(p.id)}
            disabled={borrando === p.id}
            className="p-1.5 text-slate-600 hover:text-rose-400 disabled:opacity-50 transition-colors flex-shrink-0"
            aria-label="Eliminar pago"
          >
            {borrando === p.id
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      ))}
    </div>
  );
}
