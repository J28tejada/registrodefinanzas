'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle, Archive, ArchiveRestore, ArrowLeft, ChevronLeft, ChevronRight,
  Loader2, Pencil, Trash2,
} from 'lucide-react';
import AddTransactionModal from '@/components/AddTransactionModal';
import CardForm from '@/components/CardForm';
import TransactionList from '@/components/TransactionList';
import { useFormatters } from '@/components/SettingsContext';
import { useLedger } from '@/components/LedgerContext';
import {
  CardDetail, CARD_KIND_LABEL, LEDGER_COLOR_MAP, Transaction,
} from '@/lib/types';

export default function CardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fmt = useFormatters();
  const { transactionVersion, notifyTransactionSaved, refreshLedgers } = useLedger();

  const [mes, setMes] = useState<string>(() => fmt.today().slice(0, 7));
  const [detalle, setDetalle] = useState<CardDetail | null>(null);
  const [movimientos, setMovimientos] = useState<Transaction[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [txEditando, setTxEditando] = useState<Transaction | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await fetch(`/api/cards/${id}?month=${mes}`);
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudo cargar la tarjeta'); return; }
      setDetalle(datos.detail);
      setMovimientos(datos.transactions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la tarjeta');
    } finally {
      setCargando(false);
    }
  }, [id, mes]);

  useEffect(() => { cargar(); }, [cargar, transactionVersion]);

  const moverMes = (delta: number) => {
    const [a, m] = mes.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1 + delta, 1));
    setMes(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  /**
   * Después de tocar un movimiento se recarga todo, no solo su fila.
   *
   * Cambiarle el medio de pago es de las correcciones más comunes, y ahí el
   * movimiento deja de ser de esta tarjeta: tiene que irse de la lista y salir
   * de las cifras del mes. Avisar por el contexto alcanza para las dos cosas,
   * porque de ese contador cuelga la recarga de esta pantalla y la del resto.
   */
  const movimientoGuardado = () => { notifyTransactionSaved(); refreshLedgers(); };

  const borrarMovimiento = async (idMovimiento: string) => {
    if (!confirm('¿Eliminar esta transacción?')) return;
    await fetch(`/api/transactions/${idMovimiento}`, { method: 'DELETE' });
    movimientoGuardado();
  };

  const archivar = async () => {
    if (!detalle) return;
    setOcupado(true);
    setError('');
    try {
      const res = await fetch(`/api/cards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !detalle.card.archived }),
      });
      if (!res.ok) { setError((await res.json()).error ?? 'No se pudo archivar'); return; }
      await cargar();
    } finally {
      setOcupado(false);
    }
  };

  const eliminar = async () => {
    if (!detalle) return;
    if (!confirm(`¿Eliminar ${detalle.card.name}?`)) return;
    setOcupado(true);
    setError('');
    try {
      const res = await fetch(`/api/cards/${id}`, { method: 'DELETE' });
      if (!res.ok) { setError((await res.json()).error ?? 'No se pudo eliminar'); return; }
      router.push('/cards');
    } finally {
      setOcupado(false);
    }
  };

  if (cargando && !detalle) {
    return (
      <div className="max-w-2xl mx-auto pt-14 md:pt-0 flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!detalle) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 pt-14 md:pt-0">
        <Volver />
        <p className="flex items-start gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error || 'Esa tarjeta no existe.'}</span>
        </p>
      </div>
    );
  }

  const { card } = detalle;
  const colores = LEDGER_COLOR_MAP[card.color] ?? { dark: '#334155', main: '#475569', text: '#e2e8f0' };
  const maxMes = Math.max(...detalle.monthly.map(m => m.total), 0);
  const maxCategoria = detalle.byCategory[0]?.total ?? 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-14 md:pt-0">
      <Volver />

      {/* La tarjeta, con su color y sus datos. */}
      <div
        className="rounded-2xl p-5 space-y-6"
        style={{ background: `linear-gradient(135deg, ${colores.dark}, ${colores.main})` }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-white truncate">{card.name}</p>
            <p className="text-sm truncate" style={{ color: colores.text }}>
              {CARD_KIND_LABEL[card.kind]}
              {card.issuer && ` · ${card.issuer}`}
              {card.archived && ' · archivada'}
            </p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => setEditando(v => !v)}
              className="p-2 bg-black/20 hover:bg-black/30 text-white rounded-lg transition-colors"
              aria-label="Editar la tarjeta"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={archivar}
              disabled={ocupado}
              className="p-2 bg-black/20 hover:bg-black/30 disabled:opacity-50 text-white rounded-lg transition-colors"
              aria-label={card.archived ? 'Restaurar la tarjeta' : 'Archivar la tarjeta'}
            >
              {card.archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            </button>
            {/* Con movimientos anotados no se borra: perderían con qué se pagaron.
                Ahí el camino es archivarla, que la saca de la lista sin tocar el
                historial. */}
            {detalle.countAllTime === 0 && (
              <button
                onClick={eliminar}
                disabled={ocupado}
                className="p-2 bg-black/20 hover:bg-rose-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                aria-label="Eliminar la tarjeta"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <p className="text-xl text-white font-mono tracking-widest">
            ···· {card.last4 || '····'}
          </p>
          <p className="text-xs text-right" style={{ color: colores.text }}>
            {fmt.money(detalle.spentAllTime)} en total
            <br />
            <span className="opacity-80">{detalle.countAllTime} movimientos</span>
          </p>
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
        </p>
      )}

      {editando && (
        <CardForm
          card={card}
          onListo={async () => { setEditando(false); await cargar(); }}
          onCancelar={() => setEditando(false)}
        />
      )}

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

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 grid grid-cols-3 gap-3">
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs text-slate-400 uppercase tracking-wider">Gastado</p>
          <p className="text-lg sm:text-xl font-bold text-white mt-1 truncate">{fmt.money(detalle.spent)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs text-slate-400 uppercase tracking-wider">Movimientos</p>
          <p className="text-lg sm:text-xl font-bold text-white mt-1">{detalle.count}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs text-slate-400 uppercase tracking-wider">Promedio</p>
          <p className="text-lg sm:text-xl font-bold text-white mt-1 truncate">{fmt.money(detalle.average)}</p>
        </div>
      </div>

      {/* Los últimos meses: un mes suelto no dice si la estás usando más. */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
        <p className="text-sm font-medium text-white">Últimos meses</p>
        {maxMes === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No hay gastos con esta tarjeta en este período.
          </p>
        ) : (
          <div className="flex items-end gap-2 h-28">
            {detalle.monthly.map(m => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                <span className="text-[10px] text-slate-500 tabular-nums">
                  {m.total > 0 ? Math.round(m.total).toLocaleString(fmt.config.locale) : ''}
                </span>
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    // Un mínimo visible: con 1px de barra no se distingue un mes
                    // flojo de uno sin gastos, y son cosas distintas.
                    height: `${m.total > 0 ? Math.max((m.total / maxMes) * 100, 4) : 0}%`,
                    background: m.month === mes ? colores.main : '#334155',
                  }}
                  title={`${m.month}: ${fmt.money(m.total)} en ${m.count} mov.`}
                />
                <span className={`text-[10px] truncate w-full text-center ${m.month === mes ? 'text-slate-300' : 'text-slate-500'}`}>
                  {fmt.monthLabel(`${m.month}-01`).slice(0, 3)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* En qué se fue: la pregunta que sigue a "gasté tanto con esta tarjeta". */}
      {detalle.byCategory.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
          <p className="text-sm font-medium text-white">En qué se fue</p>
          <div className="space-y-2.5">
            {detalle.byCategory.map(c => (
              <div key={c.category} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-300 truncate">{c.category}</span>
                  <span className="text-slate-400 tabular-nums flex-shrink-0">
                    {fmt.money(c.total)} · {c.count}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${maxCategoria > 0 ? (c.total / maxCategoria) * 100 : 0}%`,
                      background: colores.main,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movimientos */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-white">
          Movimientos del mes
          {movimientos.length > 0 && <span className="text-slate-500"> · {movimientos.length}</span>}
        </p>
        {movimientos.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center bg-slate-900 border border-slate-800 rounded-2xl">
            Nada pagado con esta tarjeta en {fmt.monthLabel(`${mes}-01`)}.
          </p>
        ) : (
          // Las mismas piezas que Movimientos: un gasto corregido desde acá
          // tiene que comportarse igual que corregido allá, y con el modal
          // completo se le puede cambiar hasta la tarjeta.
          <TransactionList
            transactions={movimientos}
            onEdit={t => { setTxEditando(t); setModalAbierto(true); }}
            onDelete={borrarMovimiento}
          />
        )}
      </div>

      <AddTransactionModal
        isOpen={modalAbierto}
        onClose={() => { setModalAbierto(false); setTxEditando(null); }}
        onSave={movimientoGuardado}
        editingTransaction={txEditando}
      />
    </div>
  );
}

function Volver() {
  return (
    <Link
      href="/cards"
      className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
    >
      <ArrowLeft className="w-4 h-4" /> Tarjetas
    </Link>
  );
}
