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
          <h1 className="text-xl sm:text-2xl font-semibold text-tinta">Deudas</h1>
          <p className="text-tinta-2 text-sm">Préstamos y cuotas, con lo que falta de cada uno</p>
        </div>
        <button
          onClick={() => setCreando(v => !v)}
          className="px-3 py-2 bg-primario hover:bg-primario/85 text-sobre-primario rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nueva</span>
        </button>
      </div>

      {/* Mes */}
      <div className="flex items-center justify-center gap-1">
        <button onClick={() => moverMes(-1)} className="p-1 text-tinta-2 hover:text-tinta rounded transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm text-tinta min-w-[140px] text-center">
          {fmt.monthLabel(`${mes}-01`)}
        </span>
        <button onClick={() => moverMes(1)} className="p-1 text-tinta-2 hover:text-tinta rounded transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <p className="flex items-start gap-2 text-peligro text-sm bg-peligro/10 border border-peligro/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
        </p>
      )}

      {/* Resumen del mes */}
      {activas.length > 0 && (
        <div className="border-y border-linea py-4 grid grid-cols-3 gap-3">
          <div>
            <p className="text-2xs sm:text-xs text-tinta-2">Falta en total</p>
            <p className="text-lg sm:text-xl font-semibold text-tinta tabular-nums mt-1">{fmt.money(totalRestante)}</p>
          </div>
          <div>
            <p className="text-2xs sm:text-xs text-tinta-2">Cuotas del mes</p>
            <p className="text-lg sm:text-xl font-semibold text-tinta tabular-nums mt-1">{fmt.money(cuotaDelMes)}</p>
          </div>
          <div>
            <p className="text-2xs sm:text-xs text-tinta-2">Pagado</p>
            <p className="text-lg sm:text-xl font-semibold text-acento tabular-nums mt-1">{fmt.money(pagadoDelMes)}</p>
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
            <div key={i} className="h-28 bg-hundido rounded-xl animate-pulse" />
          ))}
        </div>
      ) : debts.length === 0 ? (
        <div className="flex flex-col items-center text-center py-12">
          <div className="w-12 h-12 rounded-full bg-hundido flex items-center justify-center mb-3">
            <Landmark className="w-5 h-5 text-tinta-2" />
          </div>
          <p className="text-sm font-medium text-tinta">Todavía no cargaste ninguna deuda</p>
          <p className="text-sm text-tinta-2 mt-1">Un préstamo, una tarjeta, una compra en cuotas.</p>
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
            <div className="pt-4">
              <p className="text-sm font-medium text-tinta-2 mb-1">Saldadas</p>
              {saldadas.map(d => (
                <div key={d.id} className="border-t border-linea py-3 flex items-center gap-3">
                  <Check className="w-4 h-4 text-acento flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-tinta truncate">{d.name}</p>
                    <p className="text-xs text-tinta-2">{fmt.money(d.total_amount)} · pagada</p>
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

  const tono = deuda.monthCovered ? 'bg-primario' : deuda.paidThisMonth > 0 ? 'bg-aviso' : 'bg-presionado';

  return (
    <div className="bg-panel border border-linea rounded-xl p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-tinta truncate">{deuda.name}</p>
          <p className="text-xs text-tinta-2">
            {deuda.creditor && <>{deuda.creditor} · </>}
            {deuda.installmentsPaid.toFixed(1).replace('.0', '')} de {deuda.installments} cuotas · {deuda.category}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-peligro">{fmt.money(deuda.remaining)}</p>
          <p className="text-2xs text-tinta-2">de {fmt.money(deuda.total_amount)}</p>
        </div>
      </div>

      {/* Avance total */}
      <div className="space-y-1">
        <div className="h-2 bg-hundido rounded-full overflow-hidden">
          <div className="h-full bg-primario rounded-full transition-all" style={{ width: `${deuda.percent}%` }} />
        </div>
        <p className="text-2xs text-tinta-2">{deuda.percent}% pagado</p>
      </div>

      {/* Avance del mes: es lo que dice si vas al día */}
      <div className="bg-hundido rounded-xl p-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-tinta-2">Cuota de este mes</span>
          <span className={deuda.monthCovered ? 'text-acento' : 'text-tinta'}>
            {fmt.money(deuda.paidThisMonth)} / {fmt.money(deuda.installment_amount)}
          </span>
        </div>
        <div className="h-1.5 bg-presionado rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${tono}`} style={{ width: `${deuda.monthPercent}%` }} />
        </div>
        <p className="text-2xs text-tinta-2">
          {deuda.monthCovered
            ? 'Cuota cubierta'
            : `Faltan ${fmt.money(deuda.dueThisMonth)} para completarla`}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onAbrir}
          className="flex-1 py-2 bg-primario hover:bg-primario/85 text-sobre-primario rounded-lg text-sm font-medium transition-colors"
        >
          {abierta ? 'Cancelar' : 'Registrar pago'}
        </button>
        <button
          onClick={eliminar}
          className="p-2 text-tinta-2 hover:text-peligro hover:bg-peligro/10 rounded-lg transition-colors flex-shrink-0"
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
              className="flex-1 bg-hundido border border-linea-fuerte rounded-lg px-3 py-2 text-sm text-tinta placeholder:text-tinta-3 focus:outline-none focus:border-tinta-3"
            />
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="sm:w-40 bg-hundido border border-linea-fuerte rounded-lg px-3 py-2 text-sm text-tinta focus:outline-none focus:border-tinta-3"
            />
          </div>
          {ledgers.length > 1 && (
            <div className="relative">
              <select
                value={cuenta}
                onChange={e => setCuenta(e.target.value)}
                className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2 pr-8 text-sm text-tinta focus:outline-none focus:border-tinta-3 appearance-none"
              >
                {ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tinta-2 pointer-events-none" />
            </div>
          )}
          {error && <p className="text-xs text-peligro">{error}</p>}
          <button
            onClick={pagar}
            disabled={guardando || !monto}
            className="w-full py-2 bg-primario hover:bg-primario/85 disabled:opacity-50 text-sobre-primario rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Guardar pago
          </button>
          <p className="text-2xs text-tinta-2">
            Se anota como gasto en <span className="text-tinta-2">{deuda.category}</span>, así que
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
    <div className="bg-panel border border-linea rounded-xl p-4 sm:p-5 space-y-3">
      <p className="text-sm font-medium text-tinta flex items-center gap-2">
        <Landmark className="w-4 h-4 text-acento" /> Nueva deuda
      </p>

      <input
        type="text" value={nombre} onChange={e => setNombre(e.target.value)}
        placeholder="Nombre — ej: Préstamo del carro" autoFocus maxLength={60}
        className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta placeholder:text-tinta-3 focus:outline-none focus:border-tinta-3"
      />
      <input
        type="text" value={acreedor} onChange={e => setAcreedor(e.target.value)}
        placeholder="A quién le debés (opcional)" maxLength={60}
        className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta placeholder:text-tinta-3 focus:outline-none focus:border-tinta-3"
      />

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-tinta-2">Total</label>
          <input
            type="number" min="0" step="0.01" inputMode="decimal"
            value={total}
            onChange={e => { setTotal(e.target.value); sugerirCuota(e.target.value, cuotas); }}
            className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta focus:outline-none focus:border-tinta-3"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-tinta-2">Cuotas</label>
          <input
            type="number" min="1" step="1" inputMode="numeric"
            value={cuotas}
            onChange={e => { setCuotas(e.target.value); sugerirCuota(total, e.target.value); }}
            className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta focus:outline-none focus:border-tinta-3"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-tinta-2">Cuota mensual</label>
        <input
          type="number" min="0" step="0.01" inputMode="decimal"
          value={cuota} onChange={e => setCuota(e.target.value)}
          className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta focus:outline-none focus:border-tinta-3"
        />
        <p className="text-2xs text-tinta-2">
          Se calcula sola, pero podés cambiarla si el préstamo tiene interés.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* min-w-0: el campo de fecha de iOS no baja de su ancho intrínseco y
            estira la pista de la grilla hasta desbordar la tarjeta. */}
        <div className="space-y-1 min-w-0">
          <label className="text-xs text-tinta-2">Categoría del gasto</label>
          <div className="relative">
            <select
              value={categoria} onChange={e => setCategoria(e.target.value)}
              className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 pr-8 text-sm text-tinta focus:outline-none focus:border-tinta-3 appearance-none"
            >
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tinta-2 pointer-events-none" />
          </div>
        </div>
        <div className="space-y-1 min-w-0">
          <label className="text-xs text-tinta-2">Primera cuota</label>
          <input
            type="date" value={inicio} onChange={e => setInicio(e.target.value)}
            className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta focus:outline-none focus:border-tinta-3"
          />
        </div>
      </div>

      {ledgers.length > 1 && (
        <div className="space-y-1">
          <label className="text-xs text-tinta-2">Cuenta donde se paga</label>
          <div className="relative">
            <select
              value={ledgerId} onChange={e => setLedgerId(e.target.value)}
              className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 pr-8 text-sm text-tinta focus:outline-none focus:border-tinta-3 appearance-none"
            >
              {ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tinta-2 pointer-events-none" />
          </div>
        </div>
      )}

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox" checked={enPresupuesto}
          onChange={e => setEnPresupuesto(e.target.checked)}
          className="mt-0.5 accent-primario"
        />
        <span className="text-xs text-tinta-2">
          Ponerla en el presupuesto: crea un tope mensual en{' '}
          <span className="text-tinta">{categoria || 'la categoría elegida'}</span> por el monto de la cuota.
        </span>
      </label>

      {error && <p className="text-xs text-peligro">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={onCancelar}
          className="flex-1 py-2.5 bg-hundido hover:bg-presionado text-tinta rounded-lg text-sm transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={guardando || !nombre.trim() || !total || !cuota || !cuotas || !categoria}
          className="flex-1 py-2.5 bg-primario hover:bg-primario/85 disabled:opacity-50 text-sobre-primario rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Crear deuda
        </button>
      </div>
    </div>
  );
}
