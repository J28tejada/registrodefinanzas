import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { AlertCircle, ChevronLeft, ChevronRight, PieChart } from 'lucide-react-native';
import Texto from '../componentes/Texto';
import Pantalla from '../componentes/Pantalla';
import AnilloDeCategorias from '../componentes/AnilloDeCategorias';
import { useCuenta } from '../componentes/ContextoDeCuenta';
import { useSesion } from '../componentes/ContextoDeSesion';
import { useFormatters } from '../componentes/ContextoDeAjustes';
import { db } from '../lib/datos';
import { getSummary } from '@compartido/db';
import { limitesDelMes } from '@compartido/format';
import {
  COLOR_OTROS, COLORES_CATEGORIA, MAXIMO_PORCIONES, Porcion,
} from '@compartido/grafico-de-anillo';
import { Summary, TransactionType } from '@compartido/types';
import { useColores } from '../lib/colores';

/** El gemelo de app/stats/page.tsx. */
export default function Estadisticas() {
  const paleta = useColores();
  const fmt = useFormatters();
  const { currentLedger, transactionVersion } = useCuenta();
  const { session } = useSesion();
  const usuario = session?.user?.id;

  const [mes, setMes] = useState<string>(() => fmt.today().slice(0, 7));
  const [tipo, setTipo] = useState<TransactionType>('expense');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const { start, end } = limitesDelMes(`${mes}-01`);

  const cargar = useCallback(async () => {
    if (!usuario) return;
    setCargando(true);
    setError('');
    try {
      setSummary(await getSummary(db(usuario), currentLedger?.id, start, end));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las estadísticas');
    } finally {
      setCargando(false);
    }
  }, [usuario, start, end, currentLedger]);

  useEffect(() => { cargar(); }, [cargar, transactionVersion]);

  const moverMes = (delta: number) => {
    const [a, m] = mes.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1 + delta, 1));
    setMes(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  /** Las categorías del tipo elegido, ordenadas y con su parte del total. */
  const { filas, total } = useMemo(() => {
    const propias = (summary?.byCategory ?? [])
      .filter(c => c.type === tipo && c.total > 0)
      .sort((a, b) => b.total - a.total);
    const suma = propias.reduce((s, c) => s + c.total, 0);
    return {
      filas: propias.map(c => ({ ...c, porcentaje: suma > 0 ? (c.total / suma) * 100 : 0 })),
      total: suma,
    };
  }, [summary, tipo]);

  /**
   * Para el anillo, las primeras y el resto plegado en "Otros".
   *
   * El plegado no es cosmético: pasando los seis segmentos, dos tonos
   * cualesquiera se vuelven indistinguibles bajo daltonismo, y un anillo con
   * doce porciones no se lee de todos modos. La lista de abajo sigue mostrando
   * todas, una por una.
   */
  const porciones: Porcion[] = useMemo(() => {
    const cabeza = filas.slice(0, MAXIMO_PORCIONES).map((c, i) => ({
      categoria: c.category, total: c.total, porcentaje: c.porcentaje,
      color: COLORES_CATEGORIA[i],
    }));
    const cola = filas.slice(MAXIMO_PORCIONES);
    if (cola.length === 0) return cabeza;
    return [...cabeza, {
      categoria: 'Otros',
      total: cola.reduce((s, c) => s + c.total, 0),
      porcentaje: cola.reduce((s, c) => s + c.porcentaje, 0),
      color: COLOR_OTROS,
      agrupadas: cola.map(c => c.category),
    }];
  }, [filas]);

  const etiqueta = tipo === 'expense' ? 'Gastos' : 'Ingresos';

  return (
    <Pantalla className="gap-5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Texto className="text-xl font-semibold text-tinta">Estadísticas</Texto>
          <Texto className="text-tinta-2 text-sm" numberOfLines={1}>
            {currentLedger ? currentLedger.name : 'Todas las cuentas'}
          </Texto>
        </View>
        <View className="flex-row items-center gap-1 pt-1">
          <Pressable onPress={() => moverMes(-1)} accessibilityLabel="Mes anterior" className="p-1">
            <ChevronLeft size={16} color={paleta.tinta2} />
          </Pressable>
          <Texto className="text-sm text-tinta-2 text-center" style={{ minWidth: 110 }}>
            {fmt.monthLabel(`${mes}-01`)}
          </Texto>
          <Pressable onPress={() => moverMes(1)} accessibilityLabel="Mes siguiente" className="p-1">
            <ChevronRight size={16} color={paleta.tinta2} />
          </Pressable>
        </View>
      </View>

      <View className="flex-row gap-1 bg-panel border border-t-borde-luz border-linea rounded-2xl p-1">
        {(['expense', 'income'] as const).map(t => (
          <Pressable key={t} onPress={() => setTipo(t)}
            className={`flex-1 py-2 rounded-lg items-center ${tipo === t ? 'bg-presionado' : ''}`}>
            <Texto className={`text-sm font-medium ${tipo === t ? 'text-tinta' : 'text-tinta-2'}`}>
              {t === 'expense' ? 'Gastos' : 'Ingresos'}
            </Texto>
          </Pressable>
        ))}
      </View>

      {error ? (
        <View className="flex-row items-start gap-2 bg-peligro/10 border border-peligro/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><AlertCircle size={16} color={paleta.peligro} /></View>
          <Texto className="text-peligro text-sm flex-1">{error}</Texto>
        </View>
      ) : null}

      {cargando ? (
        <View className="bg-hundido rounded-xl h-52" />
      ) : filas.length === 0 ? (
        <View className="items-center py-12 bg-panel border border-t-borde-luz border-linea rounded-2xl">
          <PieChart size={32} color={paleta.tinta3} />
          <Texto className="text-sm text-tinta-2 mt-3">
            No hay {etiqueta.toLowerCase()} en este mes.
          </Texto>
        </View>
      ) : (
        <>
          <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-4">
            <AnilloDeCategorias
              porciones={porciones} total={total} etiqueta={etiqueta} formatearMonto={fmt.money}
            />
          </View>

          {/* El anillo da la proporción de un vistazo; los montos exactos y la
              comparación entre categorías cercanas se leen acá. */}
          <View className="gap-2">
            {filas.map((c, i) => {
              const color = i < MAXIMO_PORCIONES ? COLORES_CATEGORIA[i] : COLOR_OTROS;
              return (
                <Link
                  key={c.category}
                  href={{
                    pathname: '/transactions',
                    params: { type: tipo, category: c.category, startDate: start, endDate: end },
                  } as never}
                  asChild
                >
                  <Pressable className="bg-panel border border-t-borde-luz border-linea active:border-linea-fuerte rounded-2xl px-4 py-3">
                    <View className="flex-row items-center gap-3">
                      <View className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                      <View className="flex-1">
                        <Texto className="text-sm text-tinta" numberOfLines={1}>{c.category}</Texto>
                        <Texto className="text-xs text-tinta-2">
                          {c.porcentaje.toFixed(1)}% · {c.count} {c.count === 1 ? 'movimiento' : 'movimientos'}
                        </Texto>
                      </View>
                      <Texto className={`text-sm font-semibold ${tipo === 'expense' ? 'text-tinta' : 'text-acento'}`}
                        style={{ fontVariant: ['tabular-nums'] }}>
                        {tipo === 'expense' ? '−' : '+'}{fmt.money(c.total)}
                      </Texto>
                      <ChevronRight size={16} color={paleta.tinta3} />
                    </View>
                    {/* La barra repite la proporción a lo largo, donde sí se
                        pueden comparar dos categorías parecidas. */}
                    <View className="h-1 bg-hundido rounded-full overflow-hidden mt-2">
                      <View className="h-full rounded-full"
                        style={{ width: `${c.porcentaje}%`, backgroundColor: color }} />
                    </View>
                  </Pressable>
                </Link>
              );
            })}
          </View>

          <Texto className="text-xs text-tinta-2 text-center">
            Tocá una categoría para ver sus movimientos del mes.
          </Texto>
        </>
      )}
    </Pantalla>
  );
}
