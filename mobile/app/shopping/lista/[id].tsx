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
import { useColores } from '../../../lib/colores';

/**
 * El gemelo de app/shopping/lista/[id]/page.tsx.
 *
 * La plantilla: se edita sentado en casa, no en el súper. Acá no hay tildes ni
 * "en el carrito": eso es de la compra. Lo único que vive acá es qué se suele
 * comprar y a cuánto salía la última vez.
 */
export default function Lista() {
  const paleta = useColores();
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
        <Loader2 size={24} color={paleta.tinta2} />
      </View>
    );
  }

  if (!lista) {
    return (
      <Pantalla className="gap-4">
        <Volver />
        <Texto className="text-sm text-peligro">{error || 'Esa lista no existe.'}</Texto>
      </Pantalla>
    );
  }

  return (
    <Pantalla className="gap-4" keyboardShouldPersistTaps="handled">
      <Volver />

      <View>
        <Texto className="text-xl font-semibold text-tinta" numberOfLines={1}>{lista.name}</Texto>
        <Texto className="text-tinta-2 text-sm">
          Lista · {lista.items} {lista.items === 1 ? 'artículo' : 'artículos'}
        </Texto>
      </View>

      {error ? (
        <View className="flex-row items-start gap-2 bg-peligro/10 border border-peligro/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><AlertCircle size={16} color={paleta.peligro} /></View>
          <Texto className="text-peligro text-sm flex-1">{error}</Texto>
        </View>
      ) : null}

      <View className="bg-panel border border-linea rounded-xl p-4 flex-row items-end justify-between gap-3">
        <View className="flex-1">
          <Texto className="text-2xs text-tinta-2">Costaría</Texto>
          <Texto className="text-xl font-semibold text-tinta" numberOfLines={1}>{fmt.money(lista.total)}</Texto>
        </View>
        <View>
          <Texto className="text-xs text-tinta-2 text-right">A precios de referencia.</Texto>
          <Texto className="text-xs text-tinta-2 text-right">En el súper puede cambiar.</Texto>
        </View>
      </View>

      {usuario ? (
        <AgregarArticulo listId={lista.id} usuario={usuario} onListo={cargar} onError={setError} />
      ) : null}

      {lista.articulos.length === 0 ? (
        <View className="items-center py-10 bg-panel border border-linea rounded-xl">
          <ClipboardList size={32} color={paleta.tinta3} />
          <Texto className="text-sm text-tinta-2 mt-3">La lista está vacía.</Texto>
        </View>
      ) : (
        <View className="gap-4">
          {porCategoria.map(([categoria, articulos]) => (
            <View key={categoria} className="gap-1.5">
              <View className="flex-row items-end justify-between gap-2 px-1">
                <Texto className="text-xs font-medium text-tinta-2 flex-1" numberOfLines={1}>
                  {categoria}
                </Texto>
                <Texto className="text-xs text-tinta-3">
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
        <Trash2 size={14} color={paleta.peligro} />
        <Texto className="text-peligro text-xs">Eliminar esta lista</Texto>
      </Pressable>
    </Pantalla>
  );
}

function Volver() {
  const paleta = useColores();
  return (
    <Link href="/shopping" asChild>
      <Pressable className="flex-row items-center gap-1.5 self-start">
        <ArrowLeft size={16} color={paleta.tinta2} />
        <Texto className="text-sm text-tinta-2">Supermercado</Texto>
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
  const paleta = useColores();
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
    <View className="bg-panel border border-linea rounded-xl">
      <Pressable
        onPress={() => abierta ? setAbierta(false) : abrir()}
        className="w-full flex-row items-center gap-3 px-3 py-2.5"
      >
        <View className="flex-1">
          <Texto className="text-sm text-tinta" numberOfLines={1}>{item.name}</Texto>
          <Texto className="text-xs text-tinta-2">
            {item.quantity} {item.unit}
            {item.unit_price > 0 ? ` × ${fmt.money(item.unit_price)}` : ''}
          </Texto>
        </View>
        <Texto className="text-sm text-tinta">
          {fmt.money(item.quantity * item.unit_price)}
        </Texto>
      </Pressable>

      {abierta ? (
        <View className="px-3 pb-3 gap-2 border-t border-linea pt-3">
          <View className="flex-row gap-2">
            <View className="flex-1 gap-1">
              <Texto className="text-2xs text-tinta-2">Cantidad</Texto>
              <TextInput
                keyboardType="decimal-pad"
                value={cantidad} onChangeText={setCantidad}
                className="w-full bg-hundido border border-linea-fuerte rounded-lg px-2 py-2 text-sm text-tinta"
              />
            </View>
            <View className="flex-1 gap-1">
              <Texto className="text-2xs text-tinta-2">Unidad</Texto>
              <Selector
                value={unidad}
                opciones={UNIDADES.map(u => ({ valor: u, etiqueta: u }))}
                onChange={setUnidad}
                titulo="Unidad"
              />
            </View>
            <View className="flex-1 gap-1">
              <Texto className="text-2xs text-tinta-2">Precio c/u</Texto>
              <TextInput
                keyboardType="decimal-pad"
                value={precio} onChangeText={setPrecio}
                className="w-full bg-hundido border border-linea-fuerte rounded-lg px-2 py-2 text-sm text-tinta"
              />
            </View>
          </View>
          <View className="flex-row gap-2">
            <Pressable
              onPress={onBorrar}
              className="px-3 py-2 rounded-lg flex-row items-center gap-1.5"
            >
              <Trash2 size={14} color={paleta.peligro} />
              <Texto className="text-peligro text-xs">Quitar</Texto>
            </Pressable>
            <Pressable
              onPress={guardar}
              disabled={guardando}
              style={guardando ? { opacity: 0.5 } : undefined}
              className="flex-1 py-2 bg-primario active:bg-primario/85 rounded-lg flex-row items-center justify-center gap-1.5"
            >
              {guardando ? <Loader2 size={14} color={paleta.sobrePrimario} /> : <Check size={14} color={paleta.sobrePrimario} />}
              <Texto className="text-sobre-primario text-xs font-medium">Guardar</Texto>
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
  const paleta = useColores();
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
    <View className="bg-panel border border-linea rounded-xl p-3 gap-2">
      <View className="flex-row gap-2">
        <TextInput
          value={nombre}
          onChangeText={setNombre}
          onSubmitEditing={agregar}
          placeholder="Agregar artículo…"
          placeholderTextColor={paleta.tinta2}
          maxLength={60}
          className="flex-1 bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta"
        />
        <Pressable
          onPress={agregar}
          disabled={guardando || !nombre.trim()}
          accessibilityLabel="Agregar"
          style={guardando || !nombre.trim() ? { opacity: 0.5 } : undefined}
          className="px-4 bg-primario active:bg-primario/85 rounded-lg items-center justify-center"
        >
          {guardando ? <Loader2 size={16} color={paleta.sobrePrimario} /> : <Plus size={16} color={paleta.sobrePrimario} />}
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
