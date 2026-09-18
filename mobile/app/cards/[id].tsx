import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertCircle, Archive, ArchiveRestore, ArrowLeft, ChevronLeft, ChevronRight,
  Loader2, Pencil, Trash2,
} from 'lucide-react-native';
import Texto from '../../componentes/Texto';
import Pantalla from '../../componentes/Pantalla';
import FormularioDeTarjeta from '../../componentes/FormularioDeTarjeta';
import EstadoDeCuenta from '../../componentes/EstadoDeCuenta';
import ListaDeMovimientos from '../../componentes/ListaDeMovimientos';
import { useCuenta } from '../../componentes/ContextoDeCuenta';
import { useSesion } from '../../componentes/ContextoDeSesion';
import { useFormatters } from '../../componentes/ContextoDeAjustes';
import { db } from '../../lib/datos';
import {
  deleteCard, deleteTransaction, getAllTransactions, getCardDetail, getCards, updateCard,
} from '@compartido/db';
import { limitesDelMes } from '@compartido/format';
import { CardDetail, CARD_KIND_LABEL, LEDGER_COLOR_MAP, Transaction, llevaSaldo } from '@compartido/types';

/** El gemelo de app/cards/[id]/page.tsx. */
export default function DetalleDeTarjeta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const fmt = useFormatters();
  const { transactionVersion, notifyTransactionSaved, refreshLedgers, abrirMovimiento } = useCuenta();
  const { session } = useSesion();
  const usuario = session?.user?.id;

  const [mes, setMes] = useState<string>(() => fmt.today().slice(0, 7));
  const [detalle, setDetalle] = useState<CardDetail | null>(null);
  const [movimientos, setMovimientos] = useState<Transaction[]>([]);
  const [mediosDePago, setMediosDePago] = useState<{ id: string; name: string }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    if (!usuario || !id) return;
    setCargando(true);
    setError('');
    try {
      const datos = db(usuario);
      const { start, end } = limitesDelMes(`${mes}-01`);
      // Lo mismo que arma GET /api/cards/[id] en la web, sin la ruta en el
      // medio: el detalle, los movimientos del mes y los otros medios de pago
      // —que la pantalla necesita siempre, para decir de dónde salió un pago—.
      const encontrado = await getCardDetail(datos, id, start, end, fmt.today());
      if (!encontrado) { setDetalle(null); setError('Ese medio de pago no existe.'); return; }
      setDetalle(encontrado);
      setMovimientos(await getAllTransactions(datos, { card_id: id, startDate: start, endDate: end }));
      setMediosDePago((await getCards(datos)).filter(c => c.id !== id).map(c => ({ id: c.id, name: c.name })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el medio de pago');
    } finally {
      setCargando(false);
    }
  }, [usuario, id, mes, fmt]);

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

  const borrarMovimiento = (idMovimiento: string) => {
    Alert.alert('¿Eliminar esta transacción?', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          if (!usuario) return;
          await deleteTransaction(db(usuario), idMovimiento);
          movimientoGuardado();
        },
      },
    ]);
  };

  const archivar = async () => {
    if (!detalle || !usuario || !id) return;
    setOcupado(true);
    setError('');
    try {
      const res = await updateCard(db(usuario), id, { archived: !detalle.card.archived });
      if (!res.ok) { setError(res.error); return; }
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo archivar');
    } finally {
      setOcupado(false);
    }
  };

  const eliminar = () => {
    if (!detalle || !usuario || !id) return;
    Alert.alert(`¿Eliminar ${detalle.card.name}?`, undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          setOcupado(true);
          setError('');
          try {
            const res = await deleteCard(db(usuario), id);
            if (!res.ok) { setError(res.error ?? 'No se pudo eliminar'); return; }
            router.replace('/cards');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo eliminar');
          } finally {
            setOcupado(false);
          }
        },
      },
    ]);
  };

  if (cargando && !detalle) {
    return (
      <View className="flex-1 items-center justify-center pt-14">
        <Loader2 size={24} color="#94a3b8" />
      </View>
    );
  }

  if (!detalle) {
    return (
      <Pantalla className="gap-4">
        <Volver />
        <View className="flex-row items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><AlertCircle size={16} color="#fb7185" /></View>
          <Texto className="text-rose-400 text-sm flex-1">{error || 'Ese medio de pago no existe.'}</Texto>
        </View>
      </Pantalla>
    );
  }

  const { card } = detalle;
  const colores = LEDGER_COLOR_MAP[card.color] ?? { dark: '#334155', main: '#475569', text: '#e2e8f0' };
  const maxMes = Math.max(...detalle.monthly.map(m => m.total), 0);
  const maxCategoria = detalle.byCategory[0]?.total ?? 0;

  return (
    <Pantalla className="gap-6">
      <Volver />

      {/* La tarjeta, con su color y sus datos.
          El `linear-gradient(135deg, …)` de la web va con el degradado nativo y
          no con dos vistas apiladas: el 135deg del CSS arranca arriba a la
          izquierda y termina abajo a la derecha, que es exactamente el
          `start`/`end` de acá. Aplastarlo a un color plano se nota: esta tarjeta
          ocupa media pantalla y es lo primero que se ve al entrar. */}
      <LinearGradient
        colors={[colores.dark, colores.main]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 16 }}
      >
        <View className="p-5 gap-6">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Texto className="text-lg font-semibold text-white" numberOfLines={1}>{card.name}</Texto>
              <Texto className="text-sm" style={{ color: colores.text }} numberOfLines={1}>
                {CARD_KIND_LABEL[card.kind]}
                {card.issuer ? ` · ${card.issuer}` : ''}
                {card.archived ? ' · archivada' : ''}
              </Texto>
            </View>
            <View className="flex-row gap-1">
              <Pressable
                onPress={() => setEditando(v => !v)}
                accessibilityLabel="Editar"
                className="p-2 bg-black/20 active:bg-black/30 rounded-lg"
              >
                <Pencil size={16} color="#ffffff" />
              </Pressable>
              <Pressable
                onPress={archivar}
                disabled={ocupado}
                accessibilityLabel={card.archived ? 'Restaurar' : 'Archivar'}
                className="p-2 bg-black/20 active:bg-black/30 rounded-lg"
                style={ocupado ? { opacity: 0.5 } : undefined}
              >
                {card.archived ? <ArchiveRestore size={16} color="#ffffff" /> : <Archive size={16} color="#ffffff" />}
              </Pressable>
              {/* Con movimientos anotados no se borra: perderían con qué se pagaron.
                  Ahí el camino es archivarla, que la saca de la lista sin tocar el
                  historial. */}
              {detalle.countAllTime === 0 ? (
                <Pressable
                  onPress={eliminar}
                  disabled={ocupado}
                  accessibilityLabel="Eliminar"
                  className="p-2 bg-black/20 active:bg-rose-600 rounded-lg"
                  style={ocupado ? { opacity: 0.5 } : undefined}
                >
                  <Trash2 size={16} color="#ffffff" />
                </Pressable>
              ) : null}
            </View>
          </View>

          <View className="flex-row items-end justify-between gap-3">
              {/* El `font-mono` de la web no se porta: el teléfono solo carga
                Inter, y pedir "monospace" acá deja que cada aparato elija la
                suya —Courier en iOS, Roboto Mono en Android—, que es una
                tipografía distinta en cada mano. El `tracking-widest` ya hace
                el trabajo de separar los puntos de los dígitos. */}
            <Texto className="text-xl text-white tracking-widest">
              ···· {card.last4 || '····'}
            </Texto>
            <View>
              <Texto className="text-xs text-right" style={{ color: colores.text }}>
                {fmt.money(detalle.spentAllTime)} en total
              </Texto>
              <Texto className="text-xs text-right" style={{ color: colores.text, opacity: 0.8 }}>
                {detalle.countAllTime} movimientos
              </Texto>
            </View>
          </View>
        </View>
      </LinearGradient>

      {error ? (
        <View className="flex-row items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><AlertCircle size={16} color="#fb7185" /></View>
          <Texto className="text-rose-400 text-sm flex-1">{error}</Texto>
        </View>
      ) : null}

      {editando && usuario ? (
        <FormularioDeTarjeta
          card={card}
          usuario={usuario}
          onListo={async () => { setEditando(false); await cargar(); }}
          onCancelar={() => setEditando(false)}
        />
      ) : null}

      {/* Cuánto se debe, cuánto queda de cupo y cuándo vence. Va arriba del
          historial: es la pregunta con la que uno entra a una tarjeta de
          crédito, el gasto del mes viene después. */}
      {llevaSaldo(card) && detalle.balance && usuario ? (
        <EstadoDeCuenta
          card={card}
          balance={detalle.balance}
          payments={detalle.payments}
          mediosDePago={mediosDePago}
          usuario={usuario}
          onCambio={cargar}
        />
      ) : null}

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

      {/* Dos columnas en el teléfono, igual que en la lista: en un tercio de
          pantalla los montos salen cortados. */}
      <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 gap-3">
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Texto className="text-2xs text-slate-400 uppercase tracking-wider">Gastado</Texto>
            <Texto className="text-lg font-bold text-white mt-1" numberOfLines={1}>{fmt.money(detalle.spent)}</Texto>
          </View>
          <View className="flex-1">
            <Texto className="text-2xs text-slate-400 uppercase tracking-wider">Movimientos</Texto>
            <Texto className="text-lg font-bold text-white mt-1">{detalle.count}</Texto>
          </View>
        </View>
        <View>
          <Texto className="text-2xs text-slate-400 uppercase tracking-wider">Promedio</Texto>
          <Texto className="text-lg font-bold text-white mt-1" numberOfLines={1}>{fmt.money(detalle.average)}</Texto>
        </View>
      </View>

      {/* Los últimos meses: un mes suelto no dice si la estás usando más. */}
      <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 gap-3">
        <Texto className="text-sm font-medium text-white">Últimos meses</Texto>
        {maxMes === 0 ? (
          <Texto className="text-xs text-slate-500 py-4 text-center">
            No hay gastos por acá en este período.
          </Texto>
        ) : (
          <View className="flex-row items-end gap-2 h-28">
            {detalle.monthly.map(m => (
              <View key={m.month} className="flex-1 items-center gap-1.5">
                <Texto className="text-3xs text-slate-500 w-full text-center">
                  {m.total > 0 ? Math.round(m.total).toLocaleString(fmt.config.locale) : ''}
                </Texto>
                {/* En la web la barra crece con un `height` en porcentaje sobre
                    una fila de 112px. Acá el porcentaje también va contra el
                    alto del contenedor, que es el mismo `h-28`. */}
                <View
                  className="w-full rounded-t"
                  style={{
                    // Un mínimo visible: con 1px de barra no se distingue un mes
                    // flojo de uno sin gastos, y son cosas distintas.
                    height: `${m.total > 0 ? Math.max((m.total / maxMes) * 100, 4) : 0}%`,
                    backgroundColor: m.month === mes ? colores.main : '#334155',
                  }}
                />
                <Texto
                  className={`text-3xs w-full text-center ${m.month === mes ? 'text-slate-300' : 'text-slate-500'}`}
                  numberOfLines={1}
                >
                  {fmt.monthLabel(`${m.month}-01`).slice(0, 3)}
                </Texto>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* En qué se fue: la pregunta que sigue a "gasté tanto con esta tarjeta". */}
      {detalle.byCategory.length > 0 ? (
        <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 gap-3">
          <Texto className="text-sm font-medium text-white">En qué se fue</Texto>
          <View className="gap-2.5">
            {detalle.byCategory.map(c => (
              <View key={c.category} className="gap-1">
                <View className="flex-row items-center justify-between gap-3">
                  <Texto className="text-xs text-slate-300 flex-1" numberOfLines={1}>{c.category}</Texto>
                  <Texto className="text-xs text-slate-400">
                    {fmt.money(c.total)} · {c.count}
                  </Texto>
                </View>
                <View className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${maxCategoria > 0 ? (c.total / maxCategoria) * 100 : 0}%`,
                      backgroundColor: colores.main,
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Movimientos */}
      <View className="gap-2">
        <Texto className="text-sm font-medium text-white">
          Movimientos del mes
          {movimientos.length > 0 ? <Texto className="text-sm text-slate-500"> · {movimientos.length}</Texto> : null}
        </Texto>
        {movimientos.length === 0 ? (
          <Texto className="text-xs text-slate-500 py-6 text-center bg-slate-900 border border-slate-800 rounded-2xl">
            Nada pagado por acá en {fmt.monthLabel(`${mes}-01`)}.
          </Texto>
        ) : (
          // Las mismas piezas que Movimientos: un gasto corregido desde acá
          // tiene que comportarse igual que corregido allá, y con el modal
          // completo se le puede cambiar hasta la tarjeta.
          <ListaDeMovimientos
            transactions={movimientos}
            onEdit={abrirMovimiento}
            onDelete={borrarMovimiento}
          />
        )}
      </View>
    </Pantalla>
  );
}

function Volver() {
  return (
    <Link href="/cards" asChild>
      <Pressable className="flex-row items-center gap-1.5 self-start">
        <ArrowLeft size={16} color="#94a3b8" />
        <Texto className="text-sm text-slate-400">Billetera</Texto>
      </Pressable>
    </Link>
  );
}
