import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Filter, Plus, Search, X } from 'lucide-react-native';
import Texto from '../componentes/Texto';
import ListaDeMovimientos from '../componentes/ListaDeMovimientos';
import CampoDeFecha from '../componentes/CampoDeFecha';
import { useCuenta } from '../componentes/ContextoDeCuenta';
import { useSesion } from '../componentes/ContextoDeSesion';
import { db } from '../lib/datos';
import { deleteTransaction, getAllTransactions } from '@compartido/db';
import { Transaction, TransactionFilters, TransactionType } from '@compartido/types';

const PESTANAS: { value: TransactionType | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'income', label: 'Ingresos' },
  { value: 'expense', label: 'Gastos' },
];

/** El gemelo de app/transactions/page.tsx. */
export default function Movimientos() {
  const { currentLedger, refreshLedgers, transactionVersion, setGlobalAddOpen } = useCuenta();
  const { session } = useSesion();
  const usuario = session?.user?.id;

  // Los mismos parámetros que la web lee de la URL: el tablero enlaza acá con
  // la categoría y el rango del mes ya puestos.
  const params = useLocalSearchParams<{
    category?: string; type?: string; startDate?: string; endDate?: string;
  }>();

  const [movimientos, setMovimientos] = useState<Transaction[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState<TransactionType | ''>(
    params.type === 'income' || params.type === 'expense' ? params.type : '',
  );
  const [categoria, setCategoria] = useState(params.category ?? '');
  const [desde, setDesde] = useState(params.startDate ?? '');
  const [hasta, setHasta] = useState(params.endDate ?? '');
  const [verFiltros, setVerFiltros] = useState(Boolean(params.startDate || params.endDate));

  const cargar = useCallback(async () => {
    if (!usuario) return;
    setCargando(true);
    setError(null);
    const filtros: TransactionFilters = {};
    if (currentLedger) filtros.ledger_id = currentLedger.id;
    if (busqueda) filtros.search = busqueda;
    if (tipo) filtros.type = tipo;
    if (categoria) filtros.category = categoria;
    if (desde) filtros.startDate = desde;
    if (hasta) filtros.endDate = hasta;
    try {
      setMovimientos(await getAllTransactions(db(usuario), filtros));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los movimientos.');
    } finally {
      setCargando(false);
    }
  }, [usuario, currentLedger, busqueda, tipo, categoria, desde, hasta]);

  // Con un respiro: escribir en el buscador no dispara una consulta por tecla.
  useEffect(() => {
    const t = setTimeout(cargar, 300);
    return () => clearTimeout(t);
  }, [cargar, transactionVersion]);

  const borrar = (id: string) => {
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

  const hayFiltroDeFecha = Boolean(desde || hasta);

  return (
    <ScrollView className="flex-1" contentContainerClassName="pt-14 pb-32 gap-5">
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Texto className="text-xl font-bold text-white" numberOfLines={1}>
            {currentLedger ? currentLedger.name : 'Todas las transacciones'}
          </Texto>
          <Texto className="text-slate-400 text-sm">{movimientos.length} registros</Texto>
        </View>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setVerFiltros(v => !v)}
            className={`p-2 rounded-lg border ${
              verFiltros || hayFiltroDeFecha
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'border-slate-700'
            }`}
          >
            <Filter size={16} color={verFiltros || hayFiltroDeFecha ? '#34d399' : '#94a3b8'} />
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

      {/* Pestañas de tipo y buscador. En la web van uno al lado del otro a
          partir de `sm:`, que en un teléfono no aplica: van apilados. */}
      <View className="gap-2">
        <View className="flex-row gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
          {PESTANAS.map(({ value, label }) => {
            const activa = tipo === value;
            const fondo = !activa ? '' : value === 'income' ? 'bg-emerald-500/20'
              : value === 'expense' ? 'bg-rose-500/20' : 'bg-slate-700';
            const color = !activa ? 'text-slate-400' : value === 'income' ? 'text-emerald-300'
              : value === 'expense' ? 'text-rose-300' : 'text-white';
            return (
              <Pressable key={value} onPress={() => setTipo(value)}
                className={`flex-1 px-3 py-1.5 rounded-lg items-center ${fondo}`}>
                <Texto className={`text-xs font-medium ${color}`}>{label}</Texto>
              </Pressable>
            );
          })}
        </View>

        <View className="relative">
          <View className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
            <Search size={16} color="#64748b" />
          </View>
          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Buscar..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-8 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500"
            style={{ fontFamily: 'Inter_400Regular' }}
          />
          {busqueda ? (
            <Pressable onPress={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2">
              <X size={16} color="#64748b" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {categoria || hayFiltroDeFecha ? (
        <View className="flex-row flex-wrap gap-2">
          {categoria ? (
            <Etiqueta texto={`Categoría: ${categoria}`} onQuitar={() => setCategoria('')}
              className="bg-violet-500/10 border-violet-500/20" color="text-violet-300" />
          ) : null}
          {desde ? (
            <Etiqueta texto={`Desde: ${desde}`} onQuitar={() => setDesde('')}
              className="bg-slate-800 border-slate-700" color="text-slate-300" />
          ) : null}
          {hasta ? (
            <Etiqueta texto={`Hasta: ${hasta}`} onQuitar={() => setHasta('')}
              className="bg-slate-800 border-slate-700" color="text-slate-300" />
          ) : null}
        </View>
      ) : null}

      {verFiltros ? (
        <View className="bg-slate-900 border border-slate-800 rounded-xl p-4 gap-3">
          <Texto className="text-xs text-slate-400 font-medium">RANGO DE FECHAS</Texto>
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1.5">
              <Texto className="text-xs text-slate-500 leading-6">Desde</Texto>
              <CampoDeFecha value={desde} onChange={setDesde} />
            </View>
            <View className="flex-1 gap-1.5">
              <Texto className="text-xs text-slate-500 leading-6">Hasta</Texto>
              <CampoDeFecha value={hasta} onChange={setHasta} />
            </View>
          </View>
          {hayFiltroDeFecha ? (
            <Pressable onPress={() => { setDesde(''); setHasta(''); }}
              className="flex-row items-center gap-1">
              <X size={14} color="#94a3b8" />
              <Texto className="text-xs text-slate-400">Limpiar fechas</Texto>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <ListaDeMovimientos
        transactions={movimientos}
        loading={cargando}
        onEdit={() => setGlobalAddOpen(true)}
        onDelete={borrar}
      />
    </ScrollView>
  );
}

/** Una etiqueta de filtro activo, con su cruz para quitarlo. */
function Etiqueta({ texto, onQuitar, className, color }: {
  texto: string; onQuitar: () => void; className: string; color: string;
}) {
  return (
    <View className={`flex-row items-center gap-1.5 px-3 py-1 border rounded-full ${className}`}>
      <Texto className={`text-xs ${color}`}>{texto}</Texto>
      <Pressable onPress={onQuitar}><X size={12} color="#94a3b8" /></Pressable>
    </View>
  );
}
