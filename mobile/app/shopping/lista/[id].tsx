import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertCircle, ArrowLeft, Check, ClipboardList, Loader2, Plus, Trash2,
} from 'lucide-react-native';
import Texto from '../../../componentes/Texto';
import Pantalla from '../../../componentes/Pantalla';
import Selector from '../../../componentes/Selector';
import { useSesion } from '../../../componentes/ContextoDeSesion';
import { useFormatters } from '../../../componentes/ContextoDeAjustes';
import { db } from '../../../lib/datos';
import {
  addShoppingItem, deleteShoppingItem, deleteShoppingList, getShoppingList,
  updateShoppingItem,
} from '@compartido/db';
import { leerArticuloNuevo, leerCambiosDeArticulo } from '@compartido/compras-campos';
import { agruparPorPasillo } from '@compartido/compras';
import { PASILLOS, ShoppingItem, ShoppingListDetail, UNIDADES } from '@compartido/types';

/**
 * El gemelo de app/shopping/lista/[id]/page.tsx.
 *
 * La plantilla: se edita sentado en casa, no en el súper. Acá no hay tildes ni
 * "en el carrito": eso es de la compra. Lo único que vive acá es qué se suele
 * comprar y a cuánto salía la última vez.
 */
export default function Lista() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const fmt = useFormatters();
  const { session } = useSesion();
  const usuario = session?.user?.id;

  const [lista, setLista] = useState<ShoppingListDetail | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!usuario || !id) return;
    try {
      const encontrada = await getShoppingList(db(usuario), id);
      if (!encontrada) { setError('Esa lista no existe.'); return; }
      setLista(encontrada);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la lista');
    } finally {
      setCargando(false);
    }
  }, [usuario, id]);

  useEffect(() => { cargar(); }, [cargar]);

  const editarItem = async (itemId: string, cambios: Record<string, unknown>) => {
    if (!usuario) return false;
    setError('');
    const leido = leerCambiosDeArticulo(cambios);
    if (!leido.ok) { setError(leido.error); return false; }
    const item = await updateShoppingItem(db(usuario), itemId, leido.datos);
    if (!item) { setError('Ese artículo no existe.'); return false; }
    await cargar();
    return true;
  };

  const borrarItem = async (itemId: string) => {
    if (!usuario) return;
    await deleteShoppingItem(db(usuario), itemId);
    await cargar();
  };

  const porCategoria = useMemo(() => agruparPorPasillo(lista?.articulos ?? []), [lista]);

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center">
        <Loader2 size={24} color="#94a3b8" />
      </View>
    );
  }

  if (!lista) {
    return (
      <Pantalla className="gap-4">
        <Volver />
        <Texto className="text-sm text-rose-400">{error || 'Esa lista no existe.'}</Texto>
      </Pantalla>
    );
  }

  return (
    <Pantalla className="gap-4" keyboardShouldPersistTaps="handled">
      <Volver />

      <View>
        <Texto className="text-xl font-bold text-white" numberOfLines={1}>{lista.name}</Texto>
        <Texto className="text-slate-400 text-sm">
          Lista · {lista.items} {lista.items === 1 ? 'artículo' : 'artículos'}
        </Texto>
      </View>

      {error ? (
        <View className="flex-row items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><AlertCircle size={16} color="#fb7185" /></View>
          <Texto className="text-rose-400 text-sm flex-1">{error}</Texto>
        </View>
      ) : null}

      <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex-row items-end justify-between gap-3">
        <View className="flex-1">
          <Texto className="text-2xs uppercase tracking-wider text-slate-500">Costaría</Texto>
          <Texto className="text-xl font-bold text-white" numberOfLines={1}>{fmt.money(lista.total)}</Texto>
        </View>
        <View>
          <Texto className="text-xs text-slate-500 text-right">A precios de referencia.</Texto>
          <Texto className="text-xs text-slate-500 text-right">En el súper puede cambiar.</Texto>
        </View>
      </View>

      {usuario ? (
        <AgregarArticulo listId={lista.id} usuario={usuario} onListo={cargar} onError={setError} />
      ) : null}

      {lista.articulos.length === 0 ? (
        <View className="items-center py-10 bg-slate-900 border border-slate-800 rounded-2xl">
          <ClipboardList size={32} color="#475569" />
          <Texto className="text-sm text-slate-500 mt-3">La lista está vacía.</Texto>
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
                <FilaPlantilla
                  key={a.id}
                  item={a}
                  fmt={fmt}
                  onEditar={cambios => editarItem(a.id, cambios)}
                  onBorrar={() => borrarItem(a.id)}
                />
              ))}
            </View>
          ))}
        </View>
      )}

      <Pressable
        onPress={() => {
          Alert.alert(
            `¿Eliminar la lista "${lista.name}" con todos sus artículos?`, undefined,
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Eliminar', style: 'destructive',
                onPress: async () => {
                  if (!usuario) return;
                  await deleteShoppingList(db(usuario), lista.id);
                  router.replace('/shopping');
                },
              },
            ],
          );
        }}
        className="w-full py-2 rounded-lg flex-row items-center justify-center gap-1.5"
      >
        <Trash2 size={14} color="#fb7185" />
        <Texto className="text-rose-400 text-xs">Eliminar esta lista</Texto>
      </Pressable>
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

function FilaPlantilla({
  item, fmt, onEditar, onBorrar,
}: {
  item: ShoppingItem;
  fmt: { money: (n: number) => string };
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

  return (
    <View className="bg-slate-900 border border-slate-800 rounded-xl">
      <Pressable
        onPress={() => abierta ? setAbierta(false) : abrir()}
        className="w-full flex-row items-center gap-3 px-3 py-2.5"
      >
        <View className="flex-1">
          <Texto className="text-sm text-white" numberOfLines={1}>{item.name}</Texto>
          <Texto className="text-xs text-slate-500">
            {item.quantity} {item.unit}
            {item.unit_price > 0 ? ` × ${fmt.money(item.unit_price)}` : ''}
          </Texto>
        </View>
        <Texto className="text-sm text-slate-300">
          {fmt.money(item.quantity * item.unit_price)}
        </Texto>
      </Pressable>

      {abierta ? (
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
          <View className="flex-row gap-2">
            <Pressable
              onPress={onBorrar}
              className="px-3 py-2 rounded-lg flex-row items-center gap-1.5"
            >
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

function AgregarArticulo({
  listId, usuario, onListo, onError,
}: {
  listId: string;
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
      await addShoppingItem(db(usuario), listId, leido.datos);
      // El pasillo no se limpia: se cargan varias cosas del mismo estante
      // seguidas, y volver a elegirlo cada vez es un toque de más.
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
          placeholder="Agregar artículo…"
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
