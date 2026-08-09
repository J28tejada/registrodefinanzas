'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Landmark, Plus, Trash2, Loader2, AlertCircle, ChevronDown,
  ChevronLeft, ChevronRight, Check,
} from 'lucide-react';
import { useFormatters } from '@/components/SettingsContext';
import { useLedger } from '@/components/LedgerContext';
import { useCategories } from '@/components/CategoriesContext';
import { DebtProgress } from '@/lib/types';

export default function DebtsPage() {
  const fmt = useFormatters();
  const { ledgers, transactionVersion, notifyTransactionSaved } = useLedger();
  const { categorias } = useCategories();

  const [mes, setMes] = useState<string>(() => fmt.today().slice(0, 7));
  const [debts, setDebts] = useState<DebtProgress[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [creando, setCreando] = useState(false);
  const [pagando, setPagando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await fetch(`/api/debts?month=${mes}`);
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudieron cargar las deudas'); return; }
      setDebts(datos.debts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las deudas');
    } finally {
      setCargando(false);
    }
  }, [mes]);

  useEffect(() => { cargar(); }, [cargar, transactionVersion]);

  const moverMes = (delta: number) => {
    const [a, m] = mes.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1 + delta, 1));
    setMes(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  const activas = debts.filter(d => !d.settled);
  const saldadas = debts.filter(d => d.settled);
  const totalRestante = activas.reduce((s, d) => s + d.remaining, 0);
  const cuotaDelMes = activas.reduce((s, d) => s + d.installment_amount, 0);
  const pagadoDelMes = activas.reduce((s, d) => s + d.paidThisMonth, 0);

  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-14 md:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Deudas</h1>
          <p className="text-slate-400 text-sm">Préstamos y cuotas, con lo que falta de cada uno</p>
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
        <button onClick={() => moverMes(-1)} className="p-1 text-slate-500 hover:text-white rounded transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm text-slate-300 capitalize min-w-[140px] text-center">
          {fmt.monthLabel(`${mes}-01`)}
        </span>
        <button onClick={() => moverMes(1)} className="p-1 text-slate-500 hover:text-white rounded transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <p className="flex items-start gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
        </p>
      )}

      {/* Resumen del mes */}
      {activas.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 grid grid-cols-3 gap-3">
          <div>
            <p className="text-[11px] sm:text-xs text-slate-400 uppercase tracking-wider">Falta en total</p>
            <p className="text-lg sm:text-xl font-bold text-rose-400 mt-1">{fmt.money(totalRestante)}</p>
          </div>
          <div>
            <p className="text-[11px] sm:text-xs text-slate-400 uppercase tracking-wider">Cuotas del mes</p>
            <p className="text-lg sm:text-xl font-bold text-white mt-1">{fmt.money(cuotaDelMes)}</p>
          </div>
          <div>
            <p className="text-[11px] sm:text-xs text-slate-400 uppercase tracking-wider">Pagado</p>
            <p className="text-lg sm:text-xl font-bold text-emerald-400 mt-1">{fmt.money(pagadoDelMes)}</p>
          </div>
        </div>
      )}

      {creando && (
        <FormularioDeuda
          ledgers={ledgers.map(l => ({ id: l.id, name: l.name }))}
          categorias={[...new Set(categorias.filter(c => c.type === 'expense').map(c => c.name))].sort()}
          hoy={fmt.today()}
          onListo={async () => { setCreando(false); await cargar(); }}
          onCancelar={() => setCreando(false)}
        />
      )}

      {cargando ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : debts.length === 0 ? (
        <div className="text-center py-12 text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
          <Landmark className="w-8 h-8 mx-auto mb-3 text-slate-600" />
          <p className="text-sm">Todavía no cargaste ninguna deuda.</p>
          <p className="text-xs mt-1">Un préstamo, una tarjeta, una compra en cuotas.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activas.map(d => (
            <TarjetaDeuda
              key={d.id}
              deuda={d}
              fmt={fmt}
              ledgers={ledgers.map(l => ({ id: l.id, name: l.name }))}
              abierta={pagando === d.id}
              onAbrir={() => setPagando(pagando === d.id ? null : d.id)}
              onCambio={async () => { await cargar(); notifyTransactionSaved(); }}
            />
          ))}

          {saldadas.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Saldadas</p>
              {saldadas.map(d => (
                <div key={d.id} className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-300 truncate">{d.name}</p>
                    <p className="text-xs text-slate-500">{fmt.money(d.total_amount)} · pagada</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tarjeta ──────────────────────────────────────────────────────────────────

interface Fmt {
  money: (n: number) => string;
  today: () => string;
  monthLabel: (iso: string) => string;
}

function TarjetaDeuda({
  deuda, fmt, ledgers, abierta, onAbrir, onCambio,
}: {
  deuda: DebtProgress;
  fmt: Fmt;
  ledgers: { id: string; name: string }[];
  abierta: boolean;
  onAbrir: () => void;
  onCambio: () => void | Promise<void>;
}) {
  // Arranca con lo que falta del mes: es lo que se paga la mayoría de las veces,
  // pero se puede cambiar porque el pago real varía.
  const [monto, setMonto] = useState('');
  const [cuenta, setCuenta] = useState(deuda.ledger_id ?? ledgers[0]?.id ?? '');
  const [fecha, setFecha] = useState(fmt.today());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (abierta) {
      setMonto(deuda.dueThisMonth > 0 ? String(deuda.dueThisMonth) : String(deuda.installment_amount));
      setFecha(fmt.today());
      setError('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta]);

  const pagar = async () => {
    const n = Number(monto);
    if (!Number.isFinite(n) || n <= 0) { setError('Poné un monto mayor que cero'); return; }
    setGuardando(true);
    setError('');
    try {
      const res = await fetch(`/api/debts/${deuda.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: n, date: fecha, ledger_id: cuenta || null }),
      });
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudo registrar el pago'); return; }
      await onCambio();
      onAbrir();
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!confirm(`¿Eliminar la deuda "${deuda.name}"? Sus pagos dejan de contar, pero los gastos ya registrados quedan.`)) return;
    await fetch(`/api/debts/${deuda.id}`, { method: 'DELETE' });
    await onCambio();
  };

  const tono = deuda.monthCovered ? 'bg-emerald-500' : deuda.paidThisMonth > 0 ? 'bg-amber-500' : 'bg-slate-600';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{deuda.name}</p>
          <p className="text-xs text-slate-500">
            {deuda.creditor && <>{deuda.creditor} · </>}
            {deuda.installmentsPaid.toFixed(1).replace('.0', '')} de {deuda.installments} cuotas · {deuda.category}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-rose-400">{fmt.money(deuda.remaining)}</p>
          <p className="text-[11px] text-slate-500">de {fmt.money(deuda.total_amount)}</p>
        </div>
      </div>

      {/* Avance total */}
      <div className="space-y-1">
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${deuda.percent}%` }} />
        </div>
        <p className="text-[11px] text-slate-500">{deuda.percent}% pagado</p>
      </div>

      {/* Avance del mes: es lo que dice si vas al día */}
      <div className="bg-slate-800/60 rounded-xl p-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Cuota de este mes</span>
          <span className={deuda.monthCovered ? 'text-emerald-400' : 'text-slate-300'}>
            {fmt.money(deuda.paidThisMonth)} / {fmt.money(deuda.installment_amount)}
          </span>
        </div>
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${tono}`} style={{ width: `${deuda.monthPercent}%` }} />
        </div>
        <p className="text-[11px] text-slate-500">
          {deuda.monthCovered
            ? '✅ Cuota cubierta'
            : `Faltan ${fmt.money(deuda.dueThisMonth)} para completarla`}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onAbrir}
          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {abierta ? 'Cancelar' : 'Registrar pago'}
        </button>
        <button
          onClick={eliminar}
          className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors flex-shrink-0"
          title="Eliminar deuda"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {abierta && (
        <div className="space-y-2 pt-1">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              placeholder="Monto pagado"
              autoFocus
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="sm:w-40 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          {ledgers.length > 1 && (
            <div className="relative">
              <select
                value={cuenta}
                onChange={e => setCuenta(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-8 text-sm text-white focus:outline-none focus:border-emerald-500 appearance-none"
              >
                {ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          )}
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <button
            onClick={pagar}
            disabled={guardando || !monto}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Guardar pago
          </button>
          <p className="text-[11px] text-slate-500">
            Se anota como gasto en <span className="text-slate-400">{deuda.category}</span>, así que
            cuenta para tu presupuesto.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Alta ─────────────────────────────────────────────────────────────────────

function FormularioDeuda({
  ledgers, categorias, hoy, onListo, onCancelar,
}: {
  ledgers: { id: string; name: string }[];
  categorias: string[];
  hoy: string;
  onListo: () => void | Promise<void>;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [acreedor, setAcreedor] = useState('');
  const [total, setTotal] = useState('');
  const [cuotas, setCuotas] = useState('');
  const [cuota, setCuota] = useState('');
  const [categoria, setCategoria] = useState(categorias[0] ?? '');
  const [ledgerId, setLedgerId] = useState(ledgers[0]?.id ?? '');
  const [inicio, setInicio] = useState(hoy);
  const [enPresupuesto, setEnPresupuesto] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // La cuota se sugiere sola, pero se puede pisar: hay préstamos con interés
  // donde no es una división exacta.
  const sugerirCuota = (t: string, c: string) => {
    const nt = Number(t), nc = Number(c);
    if (Number.isFinite(nt) && Number.isFinite(nc) && nt > 0 && nc > 0) {
      setCuota((nt / nc).toFixed(2));
    }
  };

  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      const res = await fetch('/api/debts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nombre,
          creditor: acreedor,
          total_amount: Number(total),
          installment_amount: Number(cuota),
          installments: Number(cuotas),
          start_date: inicio,
          category: categoria,
          ledger_id: ledgerId || null,
          en_presupuesto: enPresupuesto,
        }),
      });
      const datos = await res.json();
      if (!res.ok) { setError(datos.error ?? 'No se pudo crear'); return; }
      await onListo();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
      <p className="text-sm font-medium text-slate-300 flex items-center gap-2">
        <Landmark className="w-4 h-4 text-emerald-400" /> Nueva deuda
      </p>

      <input
        type="text" value={nombre} onChange={e => setNombre(e.target.value)}
        placeholder="Nombre — ej: Préstamo del carro" autoFocus maxLength={60}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
      />
      <input
        type="text" value={acreedor} onChange={e => setAcreedor(e.target.value)}
        placeholder="A quién le debés (opcional)" maxLength={60}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
      />

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Total</label>
          <input
            type="number" min="0" step="0.01" inputMode="decimal"
            value={total}
            onChange={e => { setTotal(e.target.value); sugerirCuota(e.target.value, cuotas); }}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Cuotas</label>
          <input
            type="number" min="1" step="1" inputMode="numeric"
            value={cuotas}
            onChange={e => { setCuotas(e.target.value); sugerirCuota(total, e.target.value); }}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-slate-500">Cuota mensual</label>
        <input
          type="number" min="0" step="0.01" inputMode="decimal"
          value={cuota} onChange={e => setCuota(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
        />
        <p className="text-[11px] text-slate-500">
          Se calcula sola, pero podés cambiarla si el préstamo tiene interés.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Categoría del gasto</label>
          <div className="relative">
            <select
              value={categoria} onChange={e => setCategoria(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 pr-8 text-sm text-white focus:outline-none focus:border-emerald-500 appearance-none"
            >
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Primera cuota</label>
          <input
            type="date" value={inicio} onChange={e => setInicio(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {ledgers.length > 1 && (
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Cuenta donde se paga</label>
          <div className="relative">
            <select
              value={ledgerId} onChange={e => setLedgerId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 pr-8 text-sm text-white focus:outline-none focus:border-emerald-500 appearance-none"
            >
              {ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      )}

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox" checked={enPresupuesto}
          onChange={e => setEnPresupuesto(e.target.checked)}
          className="mt-0.5 accent-emerald-500"
        />
        <span className="text-xs text-slate-400">
          Ponerla en el presupuesto: crea un tope mensual en{' '}
          <span className="text-slate-300">{categoria || 'la categoría elegida'}</span> por el monto de la cuota.
        </span>
      </label>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={onCancelar}
          className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={guardando || !nombre.trim() || !total || !cuota || !cuotas || !categoria}
          className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Crear deuda
        </button>
      </div>
    </div>
  );
}
