import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import {
  AlertCircle, Check, ChevronLeft, ChevronRight, Landmark, Loader2, Plus, Trash2,
} from 'lucide-react-native';
import Texto from '../componentes/Texto';
import Pantalla from '../componentes/Pantalla';
import Selector from '../componentes/Selector';
import CampoDeFecha from '../componentes/CampoDeFecha';
import { useCuenta } from '../componentes/ContextoDeCuenta';
import { useSesion } from '../componentes/ContextoDeSesion';
import { useCategorias } from '../componentes/ContextoDeCategorias';
import { useFormatters } from '../componentes/ContextoDeAjustes';
import { db } from '../lib/datos';
import {
  createDebt, deleteDebt, getDebtsProgress, registrarPagoDeuda, upsertBudget,
} from '@compartido/db';
import { fechaValida, limitesDelMes } from '@compartido/format';
import { leerDeudaNueva } from '@compartido/deudas-campos';
import { DebtProgress } from '@compartido/types';

/** El gemelo de app/debts/page.tsx. */
export default function Deudas() {
  const fmt = useFormatters();
  const { ledgers, transactionVersion, notifyTransactionSaved } = useCuenta();
  const { categorias } = useCategorias();
  const { session } = useSesion();
  const usuario = session?.user?.id;

  const [mes, setMes] = useState<string>(() => fmt.today().slice(0, 7));
  const [debts, setDebts] = useState<DebtProgress[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [creando, setCreando] = useState(false);
  const [pagando, setPagando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!usuario) return;
    setCargando(true);
    setError('');
    try {
      const { start, end } = limitesDelMes(`${mes}-01`);
      setDebts(await getDebtsProgress(db(usuario), start, end));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las deudas');
    } finally {
      setCargando(false);
    }
  }, [usuario, mes]);

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

  const cuentas = ledgers.map(l => ({ id: l.id, name: l.name }));

  return (
    <Pantalla className="gap-6">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Texto className="text-xl font-bold text-white">Deudas</Texto>
          <Texto className="text-slate-400 text-sm">Préstamos y cuotas, con lo que falta de cada uno</Texto>
        </View>
        <Pressable
          onPress={() => setCreando(v => !v)}
          className="px-3 py-2 bg-emerald-600 active:bg-emerald-500 rounded-xl flex-row items-center gap-1.5"
        >
          <Plus size={16} color="#ffffff" />
        </Pressable>
      </View>

      {/* Mes */}
      <View className="flex-row items-center justify-center gap-1">
        <Pressable onPress={() => moverMes(-1)} accessibilityLabel="Mes anterior" className="p-1">
          <ChevronLeft size={16} color="#64748b" />
        </Pressable>
        <Texto className="text-sm text-slate-300 capitalize text-center" style={{ minWidth: 140 }}>
          {fmt.monthLabel(`${mes}-01`)}
        </Texto>
        <Pressable onPress={() => moverMes(1)} accessibilityLabel="Mes siguiente" className="p-1">
          <ChevronRight size={16} color="#64748b" />
        </Pressable>
      </View>

      {error ? (
        <View className="flex-row items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><AlertCircle size={16} color="#fb7185" /></View>
          <Texto className="text-rose-400 text-sm flex-1">{error}</Texto>
        </View>
      ) : null}

      {/* Resumen del mes */}
      {activas.length > 0 ? (
        <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex-row gap-3">
          <View className="flex-1">
            <Texto className="text-2xs text-slate-400 uppercase tracking-wider">Falta en total</Texto>
            <Texto className="text-lg font-bold text-rose-400 mt-1" numberOfLines={1}>{fmt.money(totalRestante)}</Texto>
          </View>
          <View className="flex-1">
            <Texto className="text-2xs text-slate-400 uppercase tracking-wider">Cuotas del mes</Texto>
            <Texto className="text-lg font-bold text-white mt-1" numberOfLines={1}>{fmt.money(cuotaDelMes)}</Texto>
          </View>
          <View className="flex-1">
            <Texto className="text-2xs text-slate-400 uppercase tracking-wider">Pagado</Texto>
            <Texto className="text-lg font-bold text-emerald-400 mt-1" numberOfLines={1}>{fmt.money(pagadoDelMes)}</Texto>
          </View>
        </View>
      ) : null}

      {creando && usuario ? (
        <FormularioDeuda
          usuario={usuario}
          ledgers={cuentas}
          categorias={[...new Set(categorias.filter(c => c.type === 'expense').map(c => c.name))].sort()}
          hoy={fmt.today()}
          onListo={async () => { setCreando(false); await cargar(); }}
          onCancelar={() => setCreando(false)}
        />
      ) : null}

      {cargando ? (
        <View className="gap-2">
          {[0, 1].map(i => (
            <View key={i} className="h-28 bg-slate-900 border border-slate-800 rounded-2xl" />
          ))}
        </View>
      ) : debts.length === 0 ? (
        <View className="items-center py-12 bg-slate-900 border border-slate-800 rounded-2xl">
          <Landmark size={32} color="#475569" />
          <Texto className="text-sm text-slate-500 mt-3">Todavía no cargaste ninguna deuda.</Texto>
          <Texto className="text-xs text-slate-500 mt-1">Un préstamo, una tarjeta, una compra en cuotas.</Texto>
        </View>
      ) : (
        <View className="gap-3">
          {activas.map(d => (
            <TarjetaDeuda
              key={d.id}
              deuda={d}
              usuario={usuario ?? ''}
              fmt={fmt}
              ledgers={cuentas}
              abierta={pagando === d.id}
              onAbrir={() => setPagando(pagando === d.id ? null : d.id)}
              onCambio={async () => { await cargar(); notifyTransactionSaved(); }}
            />
          ))}

          {saldadas.length > 0 ? (
            <View className="gap-2 pt-2">
              <Texto className="text-xs text-slate-500 uppercase tracking-wider">Saldadas</Texto>
              {saldadas.map(d => (
                <View key={d.id} className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex-row items-center gap-3">
                  <Check size={16} color="#34d399" />
                  <View className="flex-1">
                    <Texto className="text-sm text-slate-300" numberOfLines={1}>{d.name}</Texto>
                    <Texto className="text-xs text-slate-500">{fmt.money(d.total_amount)} · pagada</Texto>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </Pantalla>
  );
}

// ─── Tarjeta ──────────────────────────────────────────────────────────────────

interface Fmt {
  money: (n: number) => string;
  today: () => string;
  monthLabel: (iso: string) => string;
}

function TarjetaDeuda({
  deuda, usuario, fmt, ledgers, abierta, onAbrir, onCambio,
}: {
  deuda: DebtProgress;
  usuario: string;
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
      const res = await registrarPagoDeuda(db(usuario), deuda.id, {
        amount: n,
        date: fechaValida(fecha, fmt.today()),
        ledger_id: cuenta || null,
      });
      if (!res.ok) { setError(res.error); return; }
      await onCambio();
      onAbrir();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = () => {
    Alert.alert(
      `¿Eliminar la deuda "${deuda.name}"?`,
      'Sus pagos dejan de contar, pero los gastos ya registrados quedan.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => { await deleteDebt(db(usuario), deuda.id); await onCambio(); },
        },
      ],
    );
  };

  const tono = deuda.monthCovered ? 'bg-emerald-500' : deuda.paidThisMonth > 0 ? 'bg-amber-500' : 'bg-slate-600';

  return (
    <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Texto className="text-sm font-medium text-white" numberOfLines={1}>{deuda.name}</Texto>
          <Texto className="text-xs text-slate-500">
            {deuda.creditor ? `${deuda.creditor} · ` : ''}
            {deuda.installmentsPaid.toFixed(1).replace('.0', '')} de {deuda.installments} cuotas · {deuda.category}
          </Texto>
        </View>
        <View className="items-end">
          <Texto className="text-sm font-semibold text-rose-400">{fmt.money(deuda.remaining)}</Texto>
          <Texto className="text-2xs text-slate-500">de {fmt.money(deuda.total_amount)}</Texto>
        </View>
      </View>

      {/* Avance total */}
      <View className="gap-1">
        <View className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <View className="h-full bg-emerald-500 rounded-full" style={{ width: `${deuda.percent}%` }} />
        </View>
        <Texto className="text-2xs text-slate-500">{deuda.percent}% pagado</Texto>
      </View>

      {/* Avance del mes: es lo que dice si vas al día */}
      <View className="bg-slate-800/60 rounded-xl p-3 gap-1.5">
        <View className="flex-row items-center justify-between">
          <Texto className="text-xs text-slate-400">Cuota de este mes</Texto>
          <Texto className={`text-xs ${deuda.monthCovered ? 'text-emerald-400' : 'text-slate-300'}`}>
            {fmt.money(deuda.paidThisMonth)} / {fmt.money(deuda.installment_amount)}
          </Texto>
        </View>
        <View className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <View className={`h-full rounded-full ${tono}`} style={{ width: `${deuda.monthPercent}%` }} />
        </View>
        <Texto className="text-2xs text-slate-500">
          {deuda.monthCovered
            ? '✅ Cuota cubierta'
            : `Faltan ${fmt.money(deuda.dueThisMonth)} para completarla`}
        </Texto>
      </View>

      <View className="flex-row gap-2">
        <Pressable
          onPress={onAbrir}
          className="flex-1 py-2 bg-emerald-600 active:bg-emerald-500 rounded-lg items-center"
        >
          <Texto className="text-white text-sm font-medium">
            {abierta ? 'Cancelar' : 'Registrar pago'}
          </Texto>
        </Pressable>
        <Pressable onPress={eliminar} accessibilityLabel="Eliminar deuda" className="p-2">
          <Trash2 size={16} color="#64748b" />
        </Pressable>
      </View>

      {abierta ? (
        <View className="gap-2 pt-1">
          {/* En la web es `flex-col sm:flex-row`: en un teléfono los dos campos
              van uno arriba del otro, que es la rama que se ve acá. */}
          <TextInput
            keyboardType="decimal-pad"
            value={monto} onChangeText={setMonto}
            placeholder="Monto pagado" placeholderTextColor="#64748b" autoFocus
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
          />
          <CampoDeFecha
            value={fecha} onChange={setFecha}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
          />
          {ledgers.length > 1 ? (
            <Selector
              value={cuenta}
              opciones={ledgers.map(l => ({ valor: l.id, etiqueta: l.name }))}
              onChange={setCuenta}
              titulo="Cuenta donde se paga"
            />
          ) : null}
          {error ? <Texto className="text-xs text-rose-400">{error}</Texto> : null}
          <Pressable
            onPress={pagar}
            disabled={guardando || !monto}
            style={guardando || !monto ? { opacity: 0.5 } : undefined}
            className="w-full py-2 bg-emerald-600 active:bg-emerald-500 rounded-lg flex-row items-center justify-center gap-2"
          >
            {guardando ? <Loader2 size={16} color="#ffffff" /> : <Check size={16} color="#ffffff" />}
            <Texto className="text-white text-sm font-medium">Guardar pago</Texto>
          </Pressable>
          <Texto className="text-2xs text-slate-500">
            Se anota como gasto en <Texto className="text-2xs text-slate-400">{deuda.category}</Texto>, así que
            cuenta para tu presupuesto.
          </Texto>
        </View>
      ) : null}
    </View>
  );
}

// ─── Alta ─────────────────────────────────────────────────────────────────────

function FormularioDeuda({
  usuario, ledgers, categorias, hoy, onListo, onCancelar,
}: {
  usuario: string;
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
      // Las mismas seis reglas que corre `POST /api/debts` del lado de la web.
      const leido = leerDeudaNueva({
        name: nombre,
        creditor: acreedor,
        total_amount: Number(total),
        installment_amount: Number(cuota),
        installments: Number(cuotas),
        start_date: inicio,
        category: categoria,
        ledger_id: ledgerId || null,
      });
      if (!leido.ok) { setError(leido.error); return; }

      const datos = db(usuario);
      const deuda = await createDebt(datos, leido.datos);
      // "Ponerla en el presupuesto" es exactamente esto: un tope mensual en su
      // categoría por el monto de la cuota. Después el pago cae ahí solo.
      if (enPresupuesto) {
        await upsertBudget(datos, deuda.category, deuda.installment_amount, deuda.ledger_id);
      }
      await onListo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear');
    } finally {
      setGuardando(false);
    }
  };

  const listo = Boolean(nombre.trim() && total && cuota && cuotas && categoria);

  return (
    <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 gap-3">
      <View className="flex-row items-center gap-2">
        <Landmark size={16} color="#34d399" />
        <Texto className="text-sm font-medium text-slate-300">Nueva deuda</Texto>
      </View>

      <TextInput
        value={nombre} onChangeText={setNombre}
        placeholder="Nombre — ej: Préstamo del carro" placeholderTextColor="#64748b"
        autoFocus maxLength={60}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
      />
      <TextInput
        value={acreedor} onChangeText={setAcreedor}
        placeholder="A quién le debés (opcional)" placeholderTextColor="#64748b" maxLength={60}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
      />

      <View className="flex-row gap-2">
        <View className="flex-1 gap-1">
          <Texto className="text-xs text-slate-500 leading-6">Total</Texto>
          <TextInput
            keyboardType="decimal-pad"
            value={total}
            onChangeText={t => { setTotal(t); sugerirCuota(t, cuotas); }}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
          />
        </View>
        <View className="flex-1 gap-1">
          <Texto className="text-xs text-slate-500 leading-6">Cuotas</Texto>
          <TextInput
            keyboardType="number-pad"
            value={cuotas}
            onChangeText={t => { setCuotas(t); sugerirCuota(total, t); }}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
          />
        </View>
      </View>

      <View className="gap-1">
        <Texto className="text-xs text-slate-500 leading-6">Cuota mensual</Texto>
        <TextInput
          keyboardType="decimal-pad"
          value={cuota} onChangeText={setCuota}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
        />
        <Texto className="text-2xs text-slate-500">
          Se calcula sola, pero podés cambiarla si el préstamo tiene interés.
        </Texto>
      </View>

      <View className="flex-row gap-2">
        <View className="flex-1 gap-1">
          <Texto className="text-xs text-slate-500 leading-6">Categoría del gasto</Texto>
          <Selector
            value={categoria}
            opciones={categorias.map(c => ({ valor: c, etiqueta: c }))}
            onChange={setCategoria}
            titulo="Categoría del gasto"
          />
        </View>
        <View className="flex-1 gap-1">
          <Texto className="text-xs text-slate-500 leading-6">Primera cuota</Texto>
          <CampoDeFecha
            value={inicio} onChange={setInicio}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5"
          />
        </View>
      </View>

      {ledgers.length > 1 ? (
        <View className="gap-1">
          <Texto className="text-xs text-slate-500 leading-6">Cuenta donde se paga</Texto>
          <Selector
            value={ledgerId}
            opciones={ledgers.map(l => ({ valor: l.id, etiqueta: l.name }))}
            onChange={setLedgerId}
            titulo="Cuenta donde se paga"
          />
        </View>
      ) : null}

      <Pressable
        onPress={() => setEnPresupuesto(v => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: enPresupuesto }}
        className="flex-row items-start gap-2"
      >
        <View className={`w-4 h-4 mt-0.5 rounded border items-center justify-center ${
          enPresupuesto ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'
        }`}>
          {enPresupuesto ? <Check size={12} color="#ffffff" /> : null}
        </View>
        <Texto className="text-xs text-slate-400 flex-1">
          Ponerla en el presupuesto: crea un tope mensual en{' '}
          <Texto className="text-xs text-slate-300">{categoria || 'la categoría elegida'}</Texto> por el monto de la cuota.
        </Texto>
      </Pressable>

      {error ? <Texto className="text-xs text-rose-400">{error}</Texto> : null}

      <View className="flex-row gap-2">
        <Pressable
          onPress={onCancelar}
          className="flex-1 py-2.5 bg-slate-800 active:bg-slate-700 rounded-lg items-center"
        >
          <Texto className="text-slate-300 text-sm">Cancelar</Texto>
        </Pressable>
        <Pressable
          onPress={guardar}
          disabled={guardando || !listo}
          style={guardando || !listo ? { opacity: 0.5 } : undefined}
          className="flex-1 py-2.5 bg-emerald-600 active:bg-emerald-500 rounded-lg flex-row items-center justify-center gap-2"
        >
          {guardando ? <Loader2 size={16} color="#ffffff" /> : <Plus size={16} color="#ffffff" />}
          <Texto className="text-white text-sm font-medium">Crear deuda</Texto>
        </Pressable>
      </View>
    </View>
  );
}
