import { useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { AlertCircle, Check, Loader2, Plus, Tags, Trash2, X } from 'lucide-react-native';
import Texto from './Texto';
import IconoDeCategoria from './IconoDeCategoria';
import SelectorDeIcono from './SelectorDeIcono';
import { useCategorias } from './ContextoDeCategorias';
import { useCuenta } from './ContextoDeCuenta';
import { useSesion } from './ContextoDeSesion';
import { db } from '../lib/datos';
import { createCategory, deleteCategory, updateCategory } from '@compartido/db';
import { leerIconoYColor } from '@compartido/categorias-campos';
import { sugerirIcono } from '@compartido/categorias-catalogo';
import { CategoryWithUsage, TransactionType } from '@compartido/types';

/** Ya no hay ámbito: la cuenta lo define, y cada cuenta tiene su lista. */
const GRUPOS: { type: TransactionType; titulo: string }[] = [
  { type: 'expense', titulo: 'Gastos' },
  { type: 'income', titulo: 'Ingresos' },
];

/** Lo que se está editando: una existente, o una nueva de tal tipo. */
type Edicion =
  | { modo: 'nueva'; type: TransactionType }
  | { modo: 'existente'; cat: CategoryWithUsage };

/**
 * El gemelo de components/CategoriesPanel.tsx.
 *
 * Crear, renombrar y personalizar categorías, en grilla y no en lista de texto:
 * con treinta nombres seguidos hay que leer uno por uno para encontrar el que
 * se busca, y con el ícono al lado alcanza con mirar. Es la misma grilla que
 * después aparece al anotar un gasto.
 *
 * Renombrar arrastra los movimientos que ya la usaban; borrar solo se puede si
 * no la usa ninguno. Por eso cada tarjeta muestra en cuántos se usa.
 */
export default function PanelDeCategorias() {
  const { cargando, error: errorCarga, refrescar, para, subDe } = useCategorias();
  const { currentLedger, ledgers } = useCuenta();
  const { session } = useSesion();
  const usuario = session?.user?.id ?? '';
  const ledgerId = currentLedger?.id ?? ledgers[0]?.id ?? null;

  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [error, setError] = useState('');

  // Si la carga falló, el panel se ve vacío y parecería que no hay categorías:
  // alguien las volvería a crear y quedarían duplicadas al recuperarse.
  const aMostrar = error || errorCarga;

  if (cargando) {
    return (
      <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 items-center">
        <Loader2 size={20} color="#64748b" />
      </View>
    );
  }

  return (
    <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 gap-5">
      <View>
        <View className="flex-row items-center gap-2">
          <Tags size={16} color="#34d399" />
          <Texto className="font-semibold text-white text-sm">Categorías</Texto>
        </View>
        <Texto className="text-xs text-slate-400 mt-0.5">
          Tocá una para cambiarle el nombre, el ícono o el color.
        </Texto>
      </View>

      {aMostrar ? (
        <View className="flex-row items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          <View className="mt-0.5"><AlertCircle size={16} color="#fb7185" /></View>
          <Texto className="text-rose-400 text-sm flex-1">{aMostrar}</Texto>
        </View>
      ) : null}

      {GRUPOS.map(({ type, titulo }) => {
        // Las propias primero: son pocas entre treinta que vinieron con la app,
        // y son las que uno viene a tocar.
        const lista = [...para(type)].sort((a, b) =>
          a.origen === b.origen ? a.name.localeCompare(b.name, 'es') : a.origen === 'usuario' ? -1 : 1,
        );
        const editandoAca = edicion?.modo === 'nueva' && edicion.type === type;

        return (
          <View key={type} className="gap-3">
            <Texto className="text-xs text-slate-400 font-medium uppercase tracking-wider">{titulo}</Texto>

            {/* Tres columnas en el teléfono, igual que la web: con cuatro la
                celda queda en 58px y "Combustible" se parte al medio. La web lo
                resuelve con `grid-cols-3`; acá el ancho va en porcentaje. */}
            <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
              {lista.map(cat => (
                <Celda key={cat.id} onPress={() => { setEdicion({ modo: 'existente', cat }); setError(''); }}>
                  <View>
                    <IconoDeCategoria icon={cat.icon} color={cat.color} type={cat.type} />
                    {/* Cuántas cuelgan. Sin esto no hay forma de saber cuáles
                        tienen segundo nivel sin abrirlas una por una. */}
                    {subDe(cat.id).length > 0 ? (
                      <View className="absolute -bottom-0.5 -right-0.5 h-4 px-1 rounded-full bg-slate-700 border border-slate-900 items-center justify-center" style={{ minWidth: 16 }}>
                        <Texto className="text-4xs text-slate-300">{subDe(cat.id).length}</Texto>
                      </View>
                    ) : null}
                  </View>
                  <Texto className="text-2xs text-slate-300 text-center w-full" numberOfLines={2}>
                    {cat.name}
                  </Texto>
                </Celda>
              ))}

              {/* Agregar, como una más de la grilla: es donde la mano ya está
                  mirando, en vez de un botón arriba a la derecha. */}
              <Celda onPress={() => { setEdicion({ modo: 'nueva', type }); setError(''); }}>
                <View className="w-11 h-11 rounded-full border border-dashed border-slate-600 items-center justify-center">
                  <Plus size={20} color="#64748b" />
                </View>
                <Texto className="text-2xs text-slate-400">Agregar</Texto>
              </Celda>
            </View>

            {editandoAca ? (
              <EditorDeCategoria
                type={type}
                usuario={usuario}
                ledgerId={ledgerId}
                onListo={async () => { setEdicion(null); await refrescar(); }}
                onCancelar={() => setEdicion(null)}
                onError={setError}
              />
            ) : null}
          </View>
        );
      })}

      {edicion?.modo === 'existente' ? (
        <EditorDeCategoria
          cat={edicion.cat}
          type={edicion.cat.type}
          usuario={usuario}
          ledgerId={ledgerId}
          subcategorias={subDe(edicion.cat.id)}
          onRefrescar={refrescar}
          onListo={async () => { setEdicion(null); await refrescar(); }}
          onCancelar={() => setEdicion(null)}
          onError={setError}
        />
      ) : null}

      <View className="gap-1.5">
        <Texto className="text-xs text-slate-500">
          Las categorías son de la cuenta, no tuyas: en una cuenta compartida las
          ven los dos y alcanza con crearlas una vez.
        </Texto>
        <Texto className="text-xs text-slate-500">
          Una categoría con movimientos no se puede borrar —quedarían con un
          nombre que ya no existe—, pero sí renombrar: los movimientos se
          renombran con ella.
        </Texto>
      </View>
    </View>
  );
}

/** Una celda de la grilla: un tercio del ancho, como el `grid-cols-3` de la web. */
function Celda({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      className="items-center gap-1.5 px-1"
      style={{ width: `${100 / 3}%`, marginBottom: 16 }}
    >
      {children}
    </Pressable>
  );
}

/** El formulario de alta y de edición, que es el mismo. */
function EditorDeCategoria({
  cat, type, usuario, ledgerId, subcategorias = [], onRefrescar, onListo, onCancelar, onError,
}: {
  cat?: CategoryWithUsage;
  type: TransactionType;
  usuario: string;
  ledgerId: string | null;
  /** Las que cuelgan de esta. Solo en edición: una nueva todavía no tiene id. */
  subcategorias?: CategoryWithUsage[];
  onRefrescar?: () => Promise<void>;
  onListo: () => void | Promise<void>;
  onCancelar: () => void;
  onError: (m: string) => void;
}) {
  const [nombre, setNombre] = useState(cat?.name ?? '');
  const [elegido, setElegido] = useState<string | null>(cat?.icon ?? null);
  const [color, setColor] = useState<string | null>(cat?.color ?? null);
  const [ocupado, setOcupado] = useState(false);

  /*
   * Mientras no se toque el selector, el ícono se adivina del nombre: escribir
   * "Combustible" ya deja puesto el surtidor. Después de tocarlo manda lo
   * elegido y la sugerencia no vuelve a pisarlo, aunque se siga escribiendo.
   *
   * Una categoría que ya tenía ícono cuenta como elegida: lo que está guardado
   * es una decisión tomada, no un vacío que haya que completar.
   */
  const [tocado, setTocado] = useState(cat?.icon != null);
  const icono = tocado ? elegido : sugerirIcono(nombre);

  const guardar = async () => {
    const name = nombre.trim();
    if (!name) return;
    setOcupado(true);
    onError('');
    try {
      // Las mismas reglas que corren las rutas de la web: un ícono que no esté
      // en el catálogo no puede llegar a la base, porque del otro lado se
      // dibujaría el genérico sin que nadie entienda por qué.
      const dibujo = leerIconoYColor({ icon: icono, color });
      if (!dibujo.ok) { onError(dibujo.error); return; }

      const datos = db(usuario);
      const res = cat
        ? await updateCategory(datos, cat.id, { name, ...dibujo.campos })
        : ledgerId
          ? await createCategory(datos, { ledger_id: ledgerId, name, type, ...dibujo.campos })
          : { error: 'Falta la cuenta.' };
      if ('error' in res) { onError(res.error); return; }
      await onListo();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setOcupado(false);
    }
  };

  const borrar = () => {
    if (!cat) return;
    Alert.alert(`¿Eliminar la categoría "${cat.name}"?`, undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          setOcupado(true);
          onError('');
          try {
            const res = await deleteCategory(db(usuario), cat.id);
            if (!res.ok) { onError(res.error ?? 'No se pudo eliminar'); return; }
            await onListo();
          } finally {
            setOcupado(false);
          }
        },
      },
    ]);
  };

  return (
    <View className="border border-slate-800 rounded-xl p-3 gap-3 bg-slate-950/40">
      {/* La vista previa al lado del nombre: se ve cómo va a quedar mientras se
          elige, sin tener que guardar para enterarse. */}
      <View className="flex-row items-center gap-3">
        <IconoDeCategoria icon={icono} color={color} type={type} />
        <TextInput
          value={nombre}
          onChangeText={setNombre}
          onSubmitEditing={guardar}
          placeholder="Nombre de la categoría"
          placeholderTextColor="#64748b"
          autoFocus
          maxLength={40}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
        />
      </View>

      <SelectorDeIcono
        icon={icono} color={color} type={type}
        onIcon={clave => { setElegido(clave); setTocado(true); }}
        onColor={setColor}
      />

      {/* Solo al editar una que ya existe: una subcategoría necesita el id de su
          padre, y una categoría que todavía no se guardó no lo tiene. */}
      {cat && onRefrescar ? (
        <Subcategorias
          padre={cat}
          lista={subcategorias}
          usuario={usuario}
          onCambio={onRefrescar}
          onError={onError}
        />
      ) : null}

      <View className="flex-row gap-2">
        {cat ? (
          <Pressable
            onPress={borrar}
            disabled={ocupado}
            accessibilityLabel="Eliminar"
            style={ocupado ? { opacity: 0.5 } : undefined}
            className="px-3 py-2.5 bg-slate-800 active:bg-rose-600 rounded-lg"
          >
            <Trash2 size={16} color="#cbd5e1" />
          </Pressable>
        ) : null}
        <Pressable
          onPress={onCancelar}
          className="flex-1 py-2.5 bg-slate-800 active:bg-slate-700 rounded-lg flex-row items-center justify-center gap-1.5"
        >
          <X size={16} color="#cbd5e1" />
          <Texto className="text-slate-300 text-sm">Cancelar</Texto>
        </Pressable>
        <Pressable
          onPress={guardar}
          disabled={ocupado || !nombre.trim()}
          style={ocupado || !nombre.trim() ? { opacity: 0.5 } : undefined}
          className="flex-1 py-2.5 bg-emerald-600 active:bg-emerald-500 rounded-lg flex-row items-center justify-center gap-1.5"
        >
          {ocupado ? <Loader2 size={16} color="#ffffff" /> : <Check size={16} color="#ffffff" />}
          <Texto className="text-white text-sm font-medium">Guardar</Texto>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Las subcategorías de una categoría: agregar, renombrar y borrar.
 *
 * Guarda de inmediato, sin esperar al "Guardar" de arriba: son filas propias en
 * la base, no campos de esta. Mezclarlas en el mismo botón haría creer que
 * cancelar deshace también lo que se agregó acá.
 */
function Subcategorias({
  padre, lista, usuario, onCambio, onError,
}: {
  padre: CategoryWithUsage;
  lista: CategoryWithUsage[];
  usuario: string;
  onCambio: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [nueva, setNueva] = useState('');
  const [ocupado, setOcupado] = useState('');

  const agregar = async () => {
    const name = nueva.trim();
    if (!name) return;
    setOcupado('nueva');
    onError('');
    try {
      const res = await createCategory(db(usuario), {
        ledger_id: padre.ledger_id ?? '', name, type: padre.type, parent_id: padre.id,
      });
      if ('error' in res) { onError(res.error); return; }
      setNueva('');
      await onCambio();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo crear');
    } finally {
      setOcupado('');
    }
  };

  const borrar = (sub: CategoryWithUsage) => {
    Alert.alert(`¿Eliminar "${sub.name}"?`, undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          setOcupado(sub.id);
          onError('');
          try {
            const res = await deleteCategory(db(usuario), sub.id);
            if (!res.ok) { onError(res.error ?? 'No se pudo eliminar'); return; }
            await onCambio();
          } finally {
            setOcupado('');
          }
        },
      },
    ]);
  };

  return (
    <View className="gap-2 pt-1 border-t border-slate-800">
      <Texto className="text-2xs text-slate-500 uppercase tracking-wider pt-2">
        Detalle de {padre.name}
      </Texto>

      {lista.length === 0 ? (
        <Texto className="text-xs text-slate-600">
          Sin detalle todavía. Al anotar un gasto en {padre.name} vas a poder
          elegir entre lo que agregues acá.
        </Texto>
      ) : null}

      <View className="flex-row flex-wrap gap-1.5">
        {lista.map(sub => (
          <View
            key={sub.id}
            className="flex-row items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg pl-2.5 pr-1 py-1"
          >
            <Texto className="text-xs text-slate-200">{sub.name}</Texto>
            <Pressable
              onPress={() => borrar(sub)}
              disabled={ocupado === sub.id}
              accessibilityLabel={`Eliminar ${sub.name}`}
              style={ocupado === sub.id ? { opacity: 0.5 } : undefined}
              className="p-0.5"
            >
              {ocupado === sub.id
                ? <Loader2 size={12} color="#64748b" />
                : <X size={12} color="#64748b" />}
            </Pressable>
          </View>
        ))}
      </View>

      <View className="flex-row gap-2">
        <TextInput
          value={nueva}
          onChangeText={setNueva}
          onSubmitEditing={agregar}
          placeholder={`Agregar a ${padre.name}`}
          placeholderTextColor="#64748b"
          maxLength={40}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        />
        <Pressable
          onPress={agregar}
          disabled={ocupado === 'nueva' || !nueva.trim()}
          style={ocupado === 'nueva' || !nueva.trim() ? { opacity: 0.5 } : undefined}
          className="px-3 py-2 bg-slate-800 active:bg-slate-700 rounded-lg justify-center"
        >
          {ocupado === 'nueva' ? <Loader2 size={16} color="#e2e8f0" /> : <Plus size={16} color="#e2e8f0" />}
        </Pressable>
      </View>
    </View>
  );
}
