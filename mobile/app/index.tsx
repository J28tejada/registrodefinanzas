import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react-native';
import Texto from '../componentes/Texto';
import Pantalla from '../componentes/Pantalla';
import ResumenDelMes from '../componentes/ResumenDelMes';
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
import { useColores } from '../lib/colores';

/** El gemelo de app/page.tsx. */
export default function Tablero() {
  const paleta = useColores();
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
    <Pantalla className="gap-8">
      {/* Cabecera */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3 flex-1">
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              {colorDeCuenta ? (
                <View className="w-3 h-3 rounded" style={{ backgroundColor: colorDeCuenta.main }} />
              ) : null}
              <Texto className="text-xl font-semibold text-tinta flex-1" numberOfLines={1}>
                {currentLedger?.name ?? 'Inicio'}
              </Texto>
            </View>
            <View className="flex-row items-center gap-1 mt-0.5">
              <Pressable onPress={irAtras} className="p-0.5">
                <ChevronLeft size={16} color={paleta.tinta2} />
              </Pressable>
              <Texto className="text-sm text-tinta-2 text-center" style={{ minWidth: 130 }}>
                {nombreDelMes}
              </Texto>
              <Pressable onPress={irAdelante} disabled={esMesActual} className="p-0.5"
                style={esMesActual ? { opacity: 0.3 } : undefined}>
                <ChevronRight size={16} color={paleta.tinta2} />
              </Pressable>
              {!esMesActual ? (
                <Pressable onPress={irAlMesActual} className="ml-1">
                  <Texto className="text-xs font-medium text-tinta">Hoy</Texto>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
        <View className="flex-row gap-2">
          <Pressable onPress={cargar} className="p-2 active:bg-hundido rounded-lg">
            <RefreshCw size={16} color={paleta.tinta2} />
          </Pressable>
          <Pressable
            onPress={() => setGlobalAddOpen(true)}
            className="flex-row items-center gap-2 px-3.5 py-2 bg-primario active:bg-primario/85 rounded-lg"
          >
            <Plus size={16} color={paleta.sobrePrimario} />
          </Pressable>
        </View>
      </View>

      {error && !cargando ? (
        <View className="bg-peligro/10 border border-peligro/30 rounded-xl p-4">
          <Texto className="text-peligro text-sm">{error}</Texto>
        </View>
      ) : null}

      {/* Lo que vence en los próximos días. Va arriba de los totales: una fecha
          de pago que se pasa cuesta un cargo por mora, y eso urge más que saber
          cuánto se gastó. */}
      <AvisosDeTarjeta avisos={avisos} />

      {cargando ? (
        <View className="bg-hundido rounded-xl h-36" />
      ) : summary ? (
        <>
          <ResumenDelMes
            income={summary.totalIncome}
            expenses={summary.totalExpenses}
            balance={summary.totalBalance}
            incomeHref={`/transactions?type=income&startDate=${inicioDelMes}&endDate=${finDelMes}`}
            expensesHref={`/transactions?type=expense&startDate=${inicioDelMes}&endDate=${finDelMes}`}
          />

          {presupuestos.length > 0 ? (
            <View>
              <View className="flex-row items-center justify-between mb-1">
                <Texto className="text-base font-semibold text-tinta">Presupuestos</Texto>
                <Link href="/budgets" asChild>
                  <Pressable><Texto className="text-sm text-tinta-2">Ver todos</Texto></Pressable>
                </Link>
              </View>
              {[...presupuestos].sort((a, b) => b.percent - a.percent).slice(0, 4).map(b => (
                <View key={b.id} className="py-3.5 border-t border-linea">
                  <BarraDePresupuesto budget={b} compact />
                </View>
              ))}
            </View>
          ) : null}

          {summary.byCategory.length > 0 ? (
            <View>
              <Texto className="text-base font-semibold text-tinta mb-1">Categorías del mes</Texto>
              {summary.byCategory.slice(0, 6).map(cat => {
                const max = summary.byCategory[0].total;
                const pct = Math.round((cat.total / max) * 100);
                const filtros = new URLSearchParams({
                  category: cat.category, startDate: inicioDelMes, endDate: finDelMes, type: cat.type,
                });
                return (
                  <Link key={`${cat.category}-${cat.type}`} href={`/transactions?${filtros}` as never} asChild>
                    <Pressable className="py-3 border-t border-linea active:bg-hundido">
                      <View className="flex-row justify-between gap-2">
                        <Texto className="text-sm text-tinta flex-1" numberOfLines={1}>{cat.category}</Texto>
                        <Texto className={`text-sm ${cat.type === 'income' ? 'text-acento' : 'text-tinta-2'}`}
                          style={{ fontVariant: ['tabular-nums'] }}>
                          {cat.type === 'income' ? '+' : ''}{fmt.money(cat.total)}
                        </Texto>
                      </View>
                      <View className="h-1 bg-hundido rounded-full overflow-hidden mt-2">
                        <View className={`h-full rounded-full ${cat.type === 'income' ? 'bg-acento' : 'bg-tinta-3'}`}
                          style={{ width: `${pct}%` }} />
                      </View>
                    </Pressable>
                  </Link>
                );
              })}
            </View>
          ) : null}
        </>
      ) : null}

      <View>
        <View className="flex-row items-center justify-between gap-2 mb-3">
          <Texto className="text-base font-semibold text-tinta">Movimientos del mes</Texto>
          <View className="flex-row gap-0.5 bg-hundido rounded-lg p-0.5">
            {([['all', 'Todos'], ['income', 'Ingresos'], ['expense', 'Gastos']] as const).map(([valor, etiqueta]) => {
              const activo = filtro === valor;
              return (
                <Pressable key={valor} onPress={() => setFiltro(valor)}
                  className={`px-3 py-1 rounded-md ${activo ? 'bg-elevado' : ''}`}>
                  <Texto className={`text-xs font-medium ${activo ? 'text-tinta' : 'text-tinta-2'}`}>{etiqueta}</Texto>
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
