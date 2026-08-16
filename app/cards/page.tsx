'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CreditCard, Plus, AlertCircle, ChevronLeft, ChevronRight, ChevronRight as Flecha,
} from 'lucide-react';
import CardForm from '@/components/CardForm';
import { useFormatters } from '@/components/SettingsContext';
import { useLedger } from '@/components/LedgerContext';
import { CardWithUsage, CARD_GROUPS, CARD_KIND_LABEL, LEDGER_COLOR_MAP } from '@/lib/types';

export default function CardsPage() {
  const fmt = useFormatters();
  const { transactionVersion } = useLedger();

  const [mes, setMes] = useState<string>(() => fmt.today().slice(0, 7));
  const [cards, setCards] = useState<CardWithUsage[]>([]);
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const params = new URLSearchParams({ month: mes });
      if (verArchivadas) params.set('archivadas', '1');
      const res = await fetch(`/api/cards?${params}`);
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudieron cargar los medios de pago'); return; }
      setCards(datos.cards ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los medios de pago');
    } finally {
      setCargando(false);
    }
  }, [mes, verArchivadas]);

  useEffect(() => { cargar(); }, [cargar, transactionVersion]);

  const moverMes = (delta: number) => {
    const [a, m] = mes.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1 + delta, 1));
    setMes(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  const total = cards.reduce((s, c) => s + c.gastoDelMes, 0);
  const activas = cards.filter(c => !c.archived);
  // La que más pesa en el mes: es la respuesta a "¿con qué estoy gastando?".
  const lider = cards.reduce<CardWithUsage | null>(
    (mayor, c) => (c.gastoDelMes > (mayor?.gastoDelMes ?? 0) ? c : mayor),
    null,
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-14 md:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Medios de pago</h1>
          <p className="text-slate-400 text-sm">Tarjetas, cuentas de banco y efectivo, con cuánto va por cada uno</p>
        </div>
        <button
          onClick={() => setCreando(v => !v)}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5 flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nueva</span>
        </button>
      </div>

      {/* Mes */}
      <div className="flex items-center justify-center gap-1">
        <button onClick={() => moverMes(-1)} className="p-1 text-slate-500 hover:text-white rounded transition-colors" aria-label="Mes anterior">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm text-slate-300 capitalize min-w-[140px] text-center">
          {fmt.monthLabel(`${mes}-01`)}
        </span>
        <button onClick={() => moverMes(1)} className="p-1 text-slate-500 hover:text-white rounded transition-colors" aria-label="Mes siguiente">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <p className="flex items-start gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
        </p>
      )}

      {cards.length > 0 && (
        // Dos columnas en el teléfono: con tres, "RD$2,250.00" no entra en su
        // tercio y el número —que es a lo que se viene— sale cortado.
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs text-slate-400 uppercase tracking-wider">Gastado</p>
            <p className="text-lg sm:text-xl font-bold text-white mt-1 truncate">{fmt.money(total)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs text-slate-400 uppercase tracking-wider">En uso</p>
            <p className="text-lg sm:text-xl font-bold text-white mt-1">{activas.length}</p>
          </div>
          <div className="min-w-0 col-span-2 sm:col-span-1">
            <p className="text-[11px] sm:text-xs text-slate-400 uppercase tracking-wider">La que más</p>
            <p className="text-sm sm:text-base font-semibold text-emerald-400 mt-1.5 truncate">
              {lider && lider.gastoDelMes > 0 ? lider.name : '—'}
            </p>
          </div>
        </div>
      )}

      {creando && (
        <CardForm
          onListo={async () => { setCreando(false); await cargar(); }}
          onCancelar={() => setCreando(false)}
        />
      )}

      {cargando ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="text-center py-12 text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
          <CreditCard className="w-8 h-8 mx-auto mb-3 text-slate-600" />
          <p className="text-sm">
            {verArchivadas ? 'No tenés nada archivado.' : 'Todavía no cargaste ninguno.'}
          </p>
          <p className="text-xs mt-1">Una tarjeta, tu cuenta corriente o de ahorro, el efectivo.</p>
        </div>
      ) : (
        // Agrupado: una tarjeta y una cuenta de banco no se leen igual, y en una
        // lista sola hay que mirar el subtítulo de cada fila para distinguirlas.
        <div className="space-y-5">
          {CARD_GROUPS.map(({ titulo, kinds }) => {
            const delGrupo = cards.filter(c => kinds.includes(c.kind));
            if (delGrupo.length === 0) return null;
            return (
              <div key={titulo} className="space-y-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider px-1">
                  {titulo}
                </p>
                {delGrupo.map(c => (
                  <FilaTarjeta key={c.id} card={c} total={total} money={fmt.money} />
                ))}
              </div>
            );
          })}
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

/** Una tarjeta de la lista. Toda la fila entra al detalle. */
function FilaTarjeta({
  card, total, money,
}: {
  card: CardWithUsage;
  total: number;
  money: (n: number) => string;
}) {
  const colores = LEDGER_COLOR_MAP[card.color] ?? { dark: '#334155', main: '#475569' };
  const parte = total > 0 ? (card.gastoDelMes / total) * 100 : 0;

  return (
    <Link
      href={`/cards/${card.id}`}
      className={`block bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 transition-colors ${card.archived ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-8 rounded-md flex-shrink-0"
          style={{ background: `linear-gradient(to right, ${colores.dark} 35%, ${colores.main} 35%)` }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          {/* El nombre se queda con el renglón entero. Los últimos cuatro bajan
              a la línea de abajo: en un teléfono le comían la mitad al nombre,
              que es lo que uno lee para saber cuál es. */}
          <p className="text-sm font-medium text-white truncate">{card.name}</p>
          <p className="text-xs text-slate-500 truncate">
            {CARD_KIND_LABEL[card.kind]}
            {card.issuer && ` · ${card.issuer}`}
            {card.last4 && ` · ···· ${card.last4}`}
            {card.archived && ' · archivada'}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-white tabular-nums">{money(card.gastoDelMes)}</p>
          <p className="text-[11px] text-slate-500">{card.usos} mov.</p>
        </div>
        <Flecha className="w-4 h-4 text-slate-600 flex-shrink-0" />
      </div>

      {/* Cuánto del gasto del mes se fue por acá: comparar dos tarjetas por sus
          montos obliga a hacer la cuenta; la barra la muestra hecha. */}
      {parte > 0 && (
        <div className="mt-3 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${parte}%`, background: colores.main }}
          />
        </div>
      )}
    </Link>
  );
}
