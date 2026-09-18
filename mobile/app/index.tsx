import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import {
  ChevronLeft, ChevronRight, Plus, RefreshCw, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react-native';
import Texto from '../componentes/Texto';
import Pantalla from '../componentes/Pantalla';
import TarjetaDeResumen from '../componentes/TarjetaDeResumen';
import BarraDePresupuesto from '../componentes/BarraDePresupuesto';
import ListaDeMovimientos from '../componentes/ListaDeMovimientos';
import AvisosDeTarjeta from '../componentes/AvisosDeTarjeta';
import { useCuenta } from '../componentes/ContextoDeCuenta';
import { useSesion } from '../componentes/ContextoDeSesion';
import { useAjustes, useFormatters } from '../componentes/ContextoDeAjustes';
import { db } from '../lib/datos';
import {
  deleteTransaction, getAllTransactions, getBudgetProgress, getCardBalances,
  getCards, getSummary,
} from '@compartido/db';
import { limitesDelMes } from '@compartido/format';
import { avisosDeTarjetas, AvisoDeTarjeta } from '@compartido/tarjetas';
import { BudgetProgress, LEDGER_COLOR_MAP, Summary, Transaction } from '@compartido/types';

/** El gemelo de app/page.tsx. */
export default function Tablero() {
  const { currentLedger, refreshLedgers, transactionVersion, setGlobalAddOpen } = useCuenta();
  const { session } = useSesion();
  const { settings } = useAjustes();
  const fmt = useFormatters();
  const usuario = session?.user?.id;

  // "Hoy" sale de la zona horaria del usuario, no de la del teléfono.
  const hoy = fmt.today();
  const [anioActual, mesActual] = hoy.split('-').map(Number);
  const [anioElegido, setAnioElegido] = useState(anioActual);
  const [mesElegido, setMesElegido] = useState(mesActual - 1);

  const mesISO = `${anioElegido}-${String(mesElegido + 1).padStart(2, '0')}-01`;
  const { start: inicioDelMes, end: finDelMes } = limitesDelMes(mesISO);
  const nombreDelMes = fmt.monthLabel(mesISO);
  const esMesActual = anioElegido === anioActual && mesElegido === mesActual - 1;

  const irAtras = () => {
    if (mesElegido === 0) { setAnioElegido(a => a - 1); setMesElegido(11); }
    else setMesElegido(m => m - 1);
  };
  const irAdelante = () => {
    if (esMesActual) return;
    if (mesElegido === 11) { setAnioElegido(a => a + 1); setMesElegido(0); }
    else setMesElegido(m => m + 1);
  };
  const irAlMesActual = () => { setAnioElegido(anioActual); setMesElegido(mesActual - 1); };

  const [summary, setSummary] = useState<Summary | null>(null);
  const [recientes, setRecientes] = useState<Transaction[]>([]);
  const [presupuestos, setPresupuestos] = useState<BudgetProgress[]>([]);
  const [avisos, setAvisos] = useState<AvisoDeTarjeta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'all' | 'income' | 'expense'>('all');

  const cargar = useCallback(async () => {
    if (!usuario) return;
    setCargando(true);
    setError(null);
    try {
      const d = db(usuario);
      // Las tres juntas, como los tres fetch en paralelo de la web.
      const [resumen, movimientos, topes] = await Promise.all([
        getSummary(d, currentLedger?.id, inicioDelMes, finDelMes),
        getAllTransactions(d, {
          ledger_id: currentLedger?.id, startDate: inicioDelMes, endDate: finDelMes,
        }),
        getBudgetProgress(d, inicioDelMes, finDelMes, currentLedger?.id),
      ]);
      setSummary(resumen);
      setRecientes(movimientos.slice(0, 10));
      setPresupuestos(topes);
    } catch (err) {
      // El motivo real: un "no se pudieron cargar los datos" no dice qué arreglar.
      setError(err instanceof Error ? err.message : 'Error al cargar los datos.');
    } finally {
      setCargando(false);
    }
  }, [usuario, currentLedger?.id, inicioDelMes, finDelMes]);

  useEffect(() => { cargar(); }, [cargar, transactionVersion]);

  /**
   * Los vencimientos de tarjeta se piden aparte del resto.
   *
   * No dependen del mes que se esté mirando —lo que vence, vence hoy— y no
   * tienen por qué frenar al tablero si fallan.
   */
  useEffect(() => {
    if (!usuario) return;
    let vigente = true;
    (async () => {
      try {
        const d = db(usuario);
        const tarjetas = await getCards(d);
        const saldos = await getCardBalances(d, tarjetas, fmt.today());
        if (vigente) setAvisos(avisosDeTarjetas(tarjetas, saldos));
      } catch { /* el aviso también llega por chat */ }
    })();
    return () => { vigente = false; };
  }, [usuario, transactionVersion, settings.timezone, fmt]);

  const borrar = (id: string) => {
    // `confirm()` no existe en React Native: es un diálogo del sistema.
    Alert.alert('¿Eliminar esta transacción?', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          if (!usuario) return;
          await deleteTransaction(db(usuario), id);
          cargar();
          refreshLedgers();
        },
      },
    ]);
  };

  const colorDeCuenta = currentLedger ? LEDGER_COLOR_MAP[currentLedger.color] : null;
  const visibles = filtro === 'all' ? recientes : recientes.filter(t => t.type === filtro);

  return (
    <Pantalla className="gap-6">
      {/* Cabecera */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3 flex-1">
          {colorDeCuenta ? (
            <View className="w-10 h-10 rounded-xl" style={{ backgroundColor: colorDeCuenta.main }} />
          ) : null}
          <View className="flex-1">
            <Texto className="text-xl font-bold text-white" numberOfLines={1}>
              {currentLedger?.name ?? 'Dashboard'}
            </Texto>
            <View className="flex-row items-center gap-1 mt-0.5">
              <Pressable onPress={irAtras} className="p-0.5">
                <ChevronLeft size={16} color="#64748b" />
              </Pressable>
              <Texto className="text-sm text-slate-400 capitalize text-center" style={{ minWidth: 130 }}>
                {nombreDelMes}
              </Texto>
              <Pressable onPress={irAdelante} disabled={esMesActual} className="p-0.5"
                style={esMesActual ? { opacity: 0.3 } : undefined}>
                <ChevronRight size={16} color="#64748b" />
              </Pressable>
              {!esMesActual ? (
                <Pressable onPress={irAlMesActual} className="ml-1">
                  <Texto className="text-xs text-emerald-400">Hoy</Texto>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
        <View className="flex-row gap-2">
          <Pressable onPress={cargar} className="p-2 active:bg-slate-800 rounded-lg">
            <RefreshCw size={16} color="#94a3b8" />
          </Pressable>
          <Pressable
            onPress={() => setGlobalAddOpen(true)}
            className="flex-row items-center gap-2 px-4 py-2 bg-emerald-600 active:bg-emerald-500 rounded-xl"
          >
            <Plus size={16} color="#ffffff" />
          </Pressable>
        </View>
      </View>

      {error && !cargando ? (
        <View className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4">
          <Texto className="text-rose-400 text-sm">{error}</Texto>
        </View>
      ) : null}

      {/* Lo que vence en los próximos días. Va arriba de los totales: una fecha
          de pago que se pasa cuesta un cargo por mora, y eso urge más que saber
          cuánto se gastó. */}
      <AvisosDeTarjeta avisos={avisos} />

      {cargando ? (
        <View className="flex-row gap-3">
          {[0, 1].map(i => (
            <View key={i} className="flex-1 bg-slate-900 border border-slate-800 rounded-xl h-28" />
          ))}
        </View>
      ) : summary ? (
        <>
          {/* Dos columnas, como la web en un teléfono: `md:grid-cols-3` no
              aplica a este ancho. El balance ocupa la fila entera. */}
          <View className="gap-3">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <TarjetaDeResumen title="Ingresos" subtitle="del mes"
                  amount={summary.totalIncome} variant="income" icon={TrendingUp} />
              </View>
              <View className="flex-1">
                <TarjetaDeResumen title="Gastos" subtitle="del mes"
                  amount={summary.totalExpenses} variant="expense" icon={TrendingDown} />
              </View>
            </View>
            <TarjetaDeResumen title="Balance" subtitle="del mes"
              amount={summary.totalBalance} variant="balance" icon={Wallet} />
          </View>

          {presupuestos.length > 0 ? (
            <View className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <View className="flex-row items-center justify-between mb-4">
                <Texto className="text-sm font-medium text-slate-300">Presupuestos del mes</Texto>
                <Link href="/budgets" asChild>
                  <Pressable><Texto className="text-xs text-emerald-400">Ver todos</Texto></Pressable>
                </Link>
              </View>
              <View className="gap-3">
                {[...presupuestos].sort((a, b) => b.percent - a.percent).slice(0, 4)
                  .map(b => <BarraDePresupuesto key={b.id} budget={b} compact />)}
              </View>
            </View>
          ) : null}

          {summary.byCategory.length > 0 ? (
            <View className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <Texto className="text-sm font-medium text-slate-300 mb-4">Top categorías del mes</Texto>
              <View className="gap-2.5">
                {summary.byCategory.slice(0, 6).map(cat => {
                  const max = summary.byCategory[0].total;
                  const pct = Math.round((cat.total / max) * 100);
                  return (
                    <View key={`${cat.category}-${cat.type}`} className="gap-1 px-2 py-1.5 rounded-lg">
                      <View className="flex-row justify-between">
                        <View className="flex-row items-center gap-2 flex-1">
                          <View className={`w-2 h-2 rounded-full ${cat.type === 'income' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          <Texto className="text-xs text-slate-300 flex-1" numberOfLines={1}>{cat.category}</Texto>
                        </View>
                        <Texto className="text-xs text-slate-400">{fmt.money(cat.total)}</Texto>
                      </View>
                      <View className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <View className={`h-full rounded-full ${cat.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`}
                          style={{ width: `${pct}%` }} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}
        </>
      ) : null}

      <View>
        <View className="flex-row items-center justify-between gap-2 mb-3">
          <Texto className="text-sm font-medium text-slate-300">Transacciones del mes</Texto>
          <View className="flex-row gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
            {([['all', 'Todos'], ['income', 'Ingresos'], ['expense', 'Gastos']] as const).map(([valor, etiqueta]) => {
              const activo = filtro === valor;
              const fondo = !activo ? '' : valor === 'income' ? 'bg-emerald-500/20'
                : valor === 'expense' ? 'bg-rose-500/20' : 'bg-slate-700';
              const color = !activo ? 'text-slate-400' : valor === 'income' ? 'text-emerald-300'
                : valor === 'expense' ? 'text-rose-300' : 'text-white';
              return (
                <Pressable key={valor} onPress={() => setFiltro(valor)}
                  className={`px-3 py-1 rounded-md ${fondo}`}>
                  <Texto className={`text-xs font-medium ${color}`}>{etiqueta}</Texto>
                </Pressable>
              );
            })}
          </View>
        </View>
        <ListaDeMovimientos
          transactions={visibles}
          loading={cargando}
          onEdit={() => setGlobalAddOpen(true)}
          onDelete={borrar}
        />
      </View>
    </Pantalla>
  );
}
