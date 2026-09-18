import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertCircle, ArrowLeft, Check, Loader2, Plus, Receipt, RefreshCw, ShoppingCart,
  Trash2,
} from 'lucide-react-native';
import Texto from '../../../componentes/Texto';
import Pantalla from '../../../componentes/Pantalla';
import Selector from '../../../componentes/Selector';
import { useCuenta } from '../../../componentes/ContextoDeCuenta';
import { useSesion } from '../../../componentes/ContextoDeSesion';
import { useCategorias } from '../../../componentes/ContextoDeCategorias';
import { useFormatters } from '../../../componentes/ContextoDeAjustes';
import { db } from '../../../lib/datos';
import {
  actualizarPreciosDeLista, addTripItem, cerrarCompra, deleteShoppingTrip,
  deleteTripItem, getCards, getShoppingTrip, updateTripItem,
} from '@compartido/db';
import { leerArticuloNuevo, leerCambiosDeArticulo } from '@compartido/compras-campos';
import { agruparPorPasillo, totalesDeCompra } from '@compartido/compras';
import {
  Card, CARD_GROUPS, PASILLOS, ShoppingTripDetail, ShoppingTripItem, UNIDADES,
} from '@compartido/types';

/**
 * El gemelo de app/shopping/compra/[id]/page.tsx.
 *
 * La compra: esta pantalla se usa parado en un pasillo, con una mano. Todo lo
 * que se toca acá pertenece a esta compra y a ninguna otra. Cambiar un precio no
 * toca la lista de la que salió — para eso está el botón explícito del final,
 * que es una decisión aparte.
 */
export default function Compra() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const fmt = useFormatters();
  const { notifyTransactionSaved } = useCuenta();
  const { categorias } = useCategorias();
  const { session } = useSesion();
  const usuario = session?.user?.id;

  const [compra, setCompra] = useState<ShoppingTripDetail | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    if (!usuario || !id) return;
    try {
      const encontrada = await getShoppingTrip(db(usuario), id);
      if (!encontrada) { setError('Esa compra no existe.'); return; }
      setCompra(encontrada);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la compra');
    } finally {
      setCargando(false);
    }
  }, [usuario, id]);

  useEffect(() => { cargar(); }, [cargar]);

  /**
   * Tildar es lo que más se toca. Se pinta al instante y se manda al servidor
   * después: esperar la respuesta con datos móviles hace que parezca que el
   * toque no registró y la gente toca dos veces.
   */
  const tildar = async (item: ShoppingTripItem) => {
    if (!usuario) return;
    // Sin volver a leer: los totales se recalculan acá. Ir a la base por cada
    // toque hace que dos toques seguidos lancen dos lecturas solapadas, y la
    // que vuelve tarde destilda el segundo artículo en pantalla.
    setCompra(c => {
      if (!c) return c;
      const articulos = c.articulos.map(a => a.id === item.id ? { ...a, checked: !a.checked } : a);
      return { ...c, articulos, ...totalesDeCompra(articulos) };
    });

    try {
      const guardado = await updateTripItem(db(usuario), item.id, { checked: !item.checked });
      if (!guardado) throw new Error('no se guardó');
    } catch {
      // Solo si falló: ahí sí hay que volver a la verdad de la base.
      setError('No se pudo guardar el tilde. Revisá la conexión.');
      await cargar();
    }
  };

  const editarItem = async (itemId: string, cambios: Record<string, unknown>) => {
    if (!usuario) return false;
    setError('');
    const leido = leerCambiosDeArticulo(cambios, { conTilde: true });
    if (!leido.ok) { setError(leido.error); return false; }
    const item = await updateTripItem(db(usuario), itemId, leido.datos);
    if (!item) { setError('Ese artículo no existe.'); return false; }
    await cargar();
    return true;
  };

  const borrarItem = async (itemId: string) => {
    if (!usuario) return;
    await deleteTripItem(db(usuario), itemId);
    await cargar();
  };

  const porCategoria = useMemo(() => agruparPorPasillo(compra?.articulos ?? []), [compra]);

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center">
        <Loader2 size={24} color="#94a3b8" />
      </View>
    );
  }

  if (!compra) {
    return (
      <Pantalla className="gap-4">
        <Volver />
        <Texto className="text-sm text-rose-400">{error || 'Esa compra no existe.'}</Texto>
      </Pantalla>
    );
  }

  const avance = compra.total > 0 ? Math.round((compra.checkedTotal / compra.total) * 100) : 0;
  const falta = compra.total - compra.checkedTotal;
  const pagado = compra.closed && compra.paid_amount != null ? compra.paid_amount : compra.checkedTotal;
  const desvio = pagado - compra.plannedTotal;

  return (
    <Pantalla className="gap-4" keyboardShouldPersistTaps="handled">
      <Volver />

      <View>
        <Texto className="text-xl font-bold text-white" numberOfLines={1}>{compra.name}</Texto>
        <Texto className="text-slate-400 text-sm">
          {compra.closed ? `Comprada el ${compra.date}` : `${compra.checkedItems} de ${compra.items} artículos`}
        </Texto>
      </View>

      {error ? (
        <View className="flex-row items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><AlertCircle size={16} color="#fb7185" /></View>
          <Texto className="text-rose-400 text-sm flex-1">{error}</Texto>
        </View>
      ) : null}
      {aviso ? (
        <View className="flex-row items-start gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><Check size={16} color="#34d399" /></View>
          <Texto className="text-emerald-400 text-sm flex-1">{aviso}</Texto>
        </View>
      ) : null}

      {/* El número por el que se abre esta pantalla en el súper. */}
      <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 gap-2">
        <View className="flex-row items-end justify-between gap-3">
          <View className="flex-1">
            <Texto className="text-2xs uppercase tracking-wider text-slate-500">
              {compra.closed ? 'Pagado' : 'En el carrito'}
            </Texto>
            <Texto className="text-2xl font-bold text-emerald-400" numberOfLines={1}>{fmt.money(pagado)}</Texto>
          </View>
          {!compra.closed && falta > 0 ? (
            <View className="items-end">
              <Texto className="text-2xs uppercase tracking-wider text-slate-500">Falta</Texto>
              <Texto className="text-sm text-slate-300">{fmt.money(falta)}</Texto>
            </View>
          ) : null}
        </View>

        {!compra.closed && compra.items > 0 ? (
          <View className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <View className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(avance, 100)}%` }} />
          </View>
        ) : null}

        {/* Contra la lista: es el control que se busca. Cuánto se despegó lo
            real de lo planeado, no cuánto se planeó. */}
        {compra.plannedTotal > 0 && Math.abs(desvio) >= 0.01 ? (
          <Texto className="text-xs text-slate-500">
            La lista decía {fmt.money(compra.plannedTotal)}
            <Texto className={`text-xs ${desvio > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {' '}· vas {fmt.money(Math.abs(desvio))} {desvio > 0 ? 'por encima' : 'por debajo'}
            </Texto>
          </Texto>
        ) : (
          <Texto className="text-xs text-slate-500">Toda la compra: {fmt.money(compra.total)}</Texto>
        )}

        {/* Lo que no estaba en la lista, aparte. Es el número que explica la
            mayor parte de los desvíos y el que no se ve mientras uno compra. */}
        {compra.unplannedItems > 0 ? (
          <Texto className="text-xs text-amber-400">
            {fmt.money(compra.unplannedTotal)} en {compra.unplannedItems}{' '}
            {compra.unplannedItems === 1 ? 'artículo que no estaba' : 'artículos que no estaban'} en la lista
          </Texto>
        ) : null}
      </View>

      {!compra.closed && usuario ? (
        <AgregarArticulo tripId={compra.id} usuario={usuario} onListo={cargar} onError={setError} />
      ) : null}

      {compra.articulos.length === 0 ? (
        <View className="items-center py-10 bg-slate-900 border border-slate-800 rounded-2xl">
          <ShoppingCart size={32} color="#475569" />
          <Texto className="text-sm text-slate-500 mt-3">Esta compra está vacía.</Texto>
        </View>
      ) : (
        <View className="gap-4">
          {porCategoria.map(([categoria, articulos]) => (
            <View key={categoria} className="gap-1.5">
              <View className="flex-row items-end justify-between gap-2 px-1">
                <Texto className="text-xs font-medium text-slate-400 uppercase tracking-wider flex-1" numberOfLines={1}>
                  {categoria}
                </Texto>
                <Texto className="text-xs text-slate-600">
                  {fmt.money(articulos.reduce((s, a) => s + a.quantity * a.unit_price, 0))}
                </Texto>
              </View>
              {articulos.map(a => (
                <FilaCompra
                  key={a.id}
                  item={a}
                  bloqueada={compra.closed}
                  fmt={fmt}
                  onTildar={() => tildar(a)}
                  onEditar={cambios => editarItem(a.id, cambios)}
                  onBorrar={() => borrarItem(a.id)}
                />
              ))}
            </View>
          ))}
        </View>
      )}

      {!compra.closed && compra.checkedItems > 0 && usuario ? (
        <CerrarCompra
          compra={compra}
          usuario={usuario}
          categorias={[...new Set(categorias.filter(c => c.type === 'expense').map(c => c.name))].sort()}
          onCerrada={async () => { notifyTransactionSaved(); await cargar(); }}
        />
      ) : null}

      {compra.closed && compra.transaction_id ? (
        <Link href="/transactions" asChild>
          <Pressable className="flex-row items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
            <Receipt size={16} color="#34d399" />
            <Texto className="text-sm text-emerald-400 flex-1">
              Ya quedó anotada como gasto. Ver en movimientos.
            </Texto>
          </Pressable>
        </Link>
      ) : null}

      {/* El camino de vuelta, explícito: la lista no se actualiza sola porque un
          día pagaste más caro, pero cuando el precio vino para quedarse,
          corregir artículo por artículo a mano no lo hace nadie. */}
      {compra.list_id ? (
        <Pressable
          onPress={async () => {
            if (!usuario) return;
            setError(''); setAviso('');
            const res = await actualizarPreciosDeLista(db(usuario), compra.id);
            if (!res.ok) { setError(res.error); return; }
            setAviso(res.actualizados === 0
              ? 'La lista ya tenía estos precios.'
              : `Se actualizaron ${res.actualizados} ${res.actualizados === 1 ? 'precio' : 'precios'} en la lista.`);
          }}
          className="w-full py-2.5 bg-slate-800 active:bg-slate-700 rounded-xl flex-row items-center justify-center gap-1.5"
        >
          <RefreshCw size={14} color="#cbd5e1" />
          <Texto className="text-slate-300 text-xs">Guardar estos precios en la lista</Texto>
        </Pressable>
      ) : null}

      {!compra.closed ? (
        <Pressable
          onPress={() => {
            Alert.alert(
              `¿Descartar la compra "${compra.name}"?`, 'La lista de la que salió no se toca.',
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Descartar', style: 'destructive',
                  onPress: async () => {
                    if (!usuario) return;
                    await deleteShoppingTrip(db(usuario), compra.id);
                    router.replace('/shopping');
                  },
                },
              ],
            );
          }}
          className="w-full py-2 rounded-lg flex-row items-center justify-center gap-1.5"
        >
          <Trash2 size={14} color="#fb7185" />
          <Texto className="text-rose-400 text-xs">Descartar esta compra</Texto>
        </Pressable>
      ) : null}
    </Pantalla>
  );
}

function Volver() {
  return (
    <Link href="/shopping" asChild>
      <Pressable className="flex-row items-center gap-1.5 self-start">
        <ArrowLeft size={16} color="#94a3b8" />
        <Texto className="text-sm text-slate-400">Supermercado</Texto>
      </Pressable>
    </Link>
  );
}

// ─── Una fila ─────────────────────────────────────────────────────────────────

function FilaCompra({
  item, bloqueada, fmt, onTildar, onEditar, onBorrar,
}: {
  item: ShoppingTripItem;
  bloqueada: boolean;
  fmt: { money: (n: number) => string };
  onTildar: () => void;
  onEditar: (cambios: Record<string, unknown>) => Promise<boolean>;
  onBorrar: () => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [cantidad, setCantidad] = useState(String(item.quantity));
  const [precio, setPrecio] = useState(String(item.unit_price));
  const [unidad, setUnidad] = useState(item.unit);
  const [guardando, setGuardando] = useState(false);

  const abrir = () => {
    setCantidad(String(item.quantity));
    setPrecio(String(item.unit_price));
    setUnidad(item.unit);
    setAbierta(true);
  };

  const guardar = async () => {
    setGuardando(true);
    const ok = await onEditar({ quantity: Number(cantidad), unit_price: Number(precio), unit: unidad });
    setGuardando(false);
    if (ok) setAbierta(false);
  };

  // Qué cambió respecto de la lista. Null = se agregó sobre la marcha.
  const subioPrecio = item.planned_unit_price != null
    && Math.abs(item.unit_price - item.planned_unit_price) >= 0.01;

  return (
    <View className={`bg-slate-900 border rounded-xl ${
      item.checked ? 'border-emerald-500/20' : 'border-slate-800'
    }`}>
      <View className="flex-row items-center gap-3 px-3 py-2.5">
        {/* Objetivo táctil grande: esto se toca con una mano, empujando un carrito. */}
        <Pressable
          onPress={onTildar}
          disabled={bloqueada}
          accessibilityLabel={item.checked ? `Desmarcar ${item.name}` : `Marcar ${item.name} como comprado`}
          accessibilityState={{ checked: item.checked }}
          style={bloqueada ? { opacity: 0.5 } : undefined}
          className={`w-9 h-9 rounded-lg items-center justify-center ${
            item.checked ? 'bg-emerald-500' : 'bg-slate-800 active:bg-slate-700'
          }`}
        >
          <Check size={20} color={item.checked ? '#ffffff' : '#475569'} />
        </Pressable>

        <Pressable
          onPress={() => bloqueada ? undefined : (abierta ? setAbierta(false) : abrir())}
          disabled={bloqueada}
          className="flex-1"
        >
          <Texto
            className={`text-sm ${item.checked ? 'text-slate-500 line-through' : 'text-white'}`}
            numberOfLines={1}
          >
            {item.name}
            {item.planned_unit_price == null ? (
              <Texto className="text-3xs text-sky-400">  nuevo</Texto>
            ) : null}
          </Texto>
          <Texto className="text-xs text-slate-500">
            {item.quantity} {item.unit}
            {item.unit_price > 0 ? ` × ${fmt.money(item.unit_price)}` : ''}
            {subioPrecio ? (
              <Texto className={`text-xs ${
                item.unit_price > item.planned_unit_price! ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {' '}(antes {fmt.money(item.planned_unit_price!)})
              </Texto>
            ) : null}
          </Texto>
        </Pressable>

        <Texto className={`text-sm ${item.checked ? 'text-emerald-400' : 'text-slate-300'}`}>
          {fmt.money(item.quantity * item.unit_price)}
        </Texto>
      </View>

      {abierta && !bloqueada ? (
        <View className="px-3 pb-3 gap-2 border-t border-slate-800 pt-3">
          <View className="flex-row gap-2">
            <View className="flex-1 gap-1">
              <Texto className="text-2xs text-slate-500">Cantidad</Texto>
              <TextInput
                keyboardType="decimal-pad"
                value={cantidad} onChangeText={setCantidad}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white"
              />
            </View>
            <View className="flex-1 gap-1">
              <Texto className="text-2xs text-slate-500">Unidad</Texto>
              <Selector
                value={unidad}
                opciones={UNIDADES.map(u => ({ valor: u, etiqueta: u }))}
                onChange={setUnidad}
                titulo="Unidad"
              />
            </View>
            <View className="flex-1 gap-1">
              <Texto className="text-2xs text-slate-500">Precio c/u</Texto>
              <TextInput
                keyboardType="decimal-pad"
                value={precio} onChangeText={setPrecio}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white"
              />
            </View>
          </View>
          <Texto className="text-2xs text-slate-500">
            Esto cambia solo esta compra. La lista queda como está.
          </Texto>
          <View className="flex-row gap-2">
            <Pressable onPress={onBorrar} className="px-3 py-2 rounded-lg flex-row items-center gap-1.5">
              <Trash2 size={14} color="#fb7185" />
              <Texto className="text-rose-400 text-xs">Quitar</Texto>
            </Pressable>
            <Pressable
              onPress={guardar}
              disabled={guardando}
              style={guardando ? { opacity: 0.5 } : undefined}
              className="flex-1 py-2 bg-emerald-600 active:bg-emerald-500 rounded-lg flex-row items-center justify-center gap-1.5"
            >
              {guardando ? <Loader2 size={14} color="#ffffff" /> : <Check size={14} color="#ffffff" />}
              <Texto className="text-white text-xs font-medium">Guardar</Texto>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ─── Alta rápida ──────────────────────────────────────────────────────────────

function AgregarArticulo({
  tripId, usuario, onListo, onError,
}: {
  tripId: string;
  usuario: string;
  onListo: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState<string>(PASILLOS[0]);
  const [guardando, setGuardando] = useState(false);

  const agregar = async () => {
    const name = nombre.trim();
    if (!name) return;
    setGuardando(true);
    try {
      const leido = leerArticuloNuevo({ name, category: categoria });
      if (!leido.ok) { onError(leido.error); return; }
      await addTripItem(db(usuario), tripId, leido.datos);
      setNombre('');
      await onListo();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo agregar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <View className="bg-slate-900 border border-slate-800 rounded-2xl p-3 gap-2">
      <View className="flex-row gap-2">
        <TextInput
          value={nombre}
          onChangeText={setNombre}
          onSubmitEditing={agregar}
          placeholder="Agregar algo que no estaba…"
          placeholderTextColor="#64748b"
          maxLength={60}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
        />
        <Pressable
          onPress={agregar}
          disabled={guardando || !nombre.trim()}
          accessibilityLabel="Agregar"
          style={guardando || !nombre.trim() ? { opacity: 0.5 } : undefined}
          className="px-4 bg-emerald-600 active:bg-emerald-500 rounded-lg items-center justify-center"
        >
          {guardando ? <Loader2 size={16} color="#ffffff" /> : <Plus size={16} color="#ffffff" />}
        </Pressable>
      </View>
      <Selector
        value={categoria}
        opciones={PASILLOS.map(p => ({ valor: p, etiqueta: p }))}
        onChange={setCategoria}
        titulo="Pasillo"
      />
    </View>
  );
}

// ─── Cerrar ───────────────────────────────────────────────────────────────────

function CerrarCompra({
  compra, usuario, categorias, onCerrada,
}: {
  compra: ShoppingTripDetail;
  usuario: string;
  categorias: string[];
  onCerrada: () => Promise<void>;
}) {
  const fmt = useFormatters();
  const [abierto, setAbierto] = useState(false);
  // "Alimentación" es donde cae la compra del súper en casi todos los casos.
  const [categoria, setCategoria] = useState(
    categorias.find(c => /aliment|super|comida|mercado/i.test(c)) ?? categorias[0] ?? '',
  );
  const [monto, setMonto] = useState(String(compra.checkedTotal));
  const [tarjeta, setTarjeta] = useState('');
  const [tarjetas, setTarjetas] = useState<Card[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // Se piden al abrir el panel y no al cargar la pantalla: en el súper esto no
  // se toca hasta pasar por caja, y son datos que no hacen falta antes.
  useEffect(() => {
    if (!abierto) return;
    getCards(db(usuario)).then(setTarjetas).catch(() => setTarjetas([]));
  }, [abierto, usuario]);

  const abrir = () => { setMonto(String(compra.checkedTotal)); setAbierto(true); };

  const cerrar = async () => {
    setGuardando(true);
    setError('');
    try {
      const res = await cerrarCompra(db(usuario), compra.id, {
        category: categoria.trim(),
        amount: Number(monto),
        card_id: tarjeta || null,
      });
      if (!res.ok) { setError(res.error); return; }
      await onCerrada();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar');
    } finally {
      setGuardando(false);
    }
  };

  const cobrado = Number(monto);
  const diferencia = Number.isFinite(cobrado) ? cobrado - compra.checkedTotal : 0;

  if (!abierto) {
    return (
      <Pressable
        onPress={abrir}
        className="w-full py-3 bg-emerald-600 active:bg-emerald-500 rounded-xl flex-row items-center justify-center gap-2"
      >
        <Receipt size={16} color="#ffffff" />
        <Texto className="text-white text-sm font-medium">Pasé por caja — anotar el gasto</Texto>
      </Pressable>
    );
  }

  return (
    <View className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4 gap-3">
      <View>
        <Texto className="text-sm font-medium text-white">Anotar la compra</Texto>
        <Texto className="text-xs text-slate-500 mt-0.5">
          Se registra como gasto del {compra.date}. Los {compra.items - compra.checkedItems} artículos
          sin tildar no se cuentan.
        </Texto>
      </View>

      {/* El ticket manda: acá aparecen impuestos, ofertas y precios distintos a
          los de la góndola. */}
      <View className="gap-1">
        <Texto className="text-xs text-slate-500 leading-6">Monto pagado</Texto>
        <TextInput
          keyboardType="decimal-pad"
          value={monto} onChangeText={setMonto}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
        />
        <Texto className="text-xs text-slate-500">
          El carrito sumaba {fmt.money(compra.checkedTotal)}
          {Math.abs(diferencia) >= 0.01 ? (
            <Texto className={`text-xs ${diferencia > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {' '}· {diferencia > 0 ? 'pagaste' : 'te ahorraste'} {fmt.money(Math.abs(diferencia))}
              {diferencia > 0 ? ' de más' : ''}
            </Texto>
          ) : null}
        </Texto>
      </View>

      <View className="gap-1">
        <Texto className="text-xs text-slate-500 leading-6">Categoría del gasto</Texto>
        <Selector
          value={categoria}
          opciones={categorias.map(c => ({ valor: c, etiqueta: c }))}
          onChange={setCategoria}
          titulo="Categoría del gasto"
        />
      </View>

      {/* Con qué se pagó. Opcional, y solo si hay tarjetas cargadas: el gasto
          del súper queda atado a su tarjeta como cualquier otro movimiento. */}
      {tarjetas.length > 0 ? (
        <View className="gap-1">
          <Texto className="text-xs text-slate-500 leading-6">Pagado con</Texto>
          <Selector
            value={tarjeta}
            opciones={[
              { valor: '', etiqueta: 'Sin especificar' },
              ...CARD_GROUPS.flatMap(({ titulo, kinds }) =>
                tarjetas
                  .filter(c => kinds.includes(c.kind))
                  .map(c => ({
                    valor: c.id,
                    etiqueta: `${c.name}${c.last4 ? ` ···· ${c.last4}` : ''}`,
                    grupo: titulo,
                  })),
              ),
            ]}
            onChange={setTarjeta}
            titulo="Pagado con"
          />
        </View>
      ) : null}

      {error ? <Texto className="text-xs text-rose-400">{error}</Texto> : null}

      <View className="flex-row gap-2">
        <Pressable
          onPress={() => setAbierto(false)}
          className="flex-1 py-2.5 bg-slate-800 active:bg-slate-700 rounded-lg items-center"
        >
          <Texto className="text-slate-300 text-sm">Todavía no</Texto>
        </Pressable>
        <Pressable
          onPress={cerrar}
          disabled={guardando || !categoria || !Number.isFinite(cobrado) || cobrado <= 0}
          style={guardando || !categoria || !Number.isFinite(cobrado) || cobrado <= 0
            ? { opacity: 0.5 } : undefined}
          className="flex-1 py-2.5 bg-emerald-600 active:bg-emerald-500 rounded-lg flex-row items-center justify-center gap-2"
        >
          {guardando ? <Loader2 size={16} color="#ffffff" /> : <Check size={16} color="#ffffff" />}
          <Texto className="text-white text-sm font-medium">Anotar gasto</Texto>
        </Pressable>
      </View>
    </View>
  );
}
