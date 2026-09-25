import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, TextInput, View } from 'react-native';
import {
  AlertCircle, Check, ChevronLeft, ChevronRight, Pencil, Plus, Target, Trash2, X,
} from 'lucide-react-native';
import Texto from '../componentes/Texto';
import Pantalla from '../componentes/Pantalla';
import BarraDePresupuesto, { budgetTone } from '../componentes/BarraDePresupuesto';
import Selector from '../componentes/Selector';
import { useCuenta } from '../componentes/ContextoDeCuenta';
import { useSesion } from '../componentes/ContextoDeSesion';
import { useCategorias } from '../componentes/ContextoDeCategorias';
import { useFormatters } from '../componentes/ContextoDeAjustes';
import { db } from '../lib/datos';
import {
  createCategory, deleteBudget, getBudgetProgress, updateBudget, upsertBudget,
} from '@compartido/db';
import { limitesDelMes } from '@compartido/format';
import { BudgetProgress } from '@compartido/types';
import { useColores } from '../lib/colores';
import { TECLADO_CON_LISTO } from '../componentes/BarraDelTeclado';

/** El gemelo de app/budgets/page.tsx. */
export default function Presupuestos() {
  const paleta = useColores();
  const fmt = useFormatters();
  const { ledgers, currentLedger, transactionVersion } = useCuenta();
  const { categorias, refrescar: refrescarCategorias } = useCategorias();
  const { session } = useSesion();
  const usuario = session?.user?.id;

  const [mes, setMes] = useState<string>(() => fmt.today().slice(0, 7));
  const [budgets, setBudgets] = useState<BudgetProgress[]>([]);
  // Los que quedaron sin cuenta: solo para avisar cuando se está mirando una.
  const [sinCuenta, setSinCuenta] = useState<BudgetProgress[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [categoria, setCategoria] = useState('');
  const [monto, setMonto] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Crear la categoría sin salir de acá: si hay que ir a otra pantalla y
  // volver, se pierde el monto que ya se estaba escribiendo.
  const [creandoCat, setCreandoCat] = useState(false);
  const [nuevaCat, setNuevaCat] = useState('');
  const [errorCat, setErrorCat] = useState('');

  const cargar = useCallback(async () => {
    if (!usuario) return;
    setCargando(true);
    setError('');
    try {
      const d = db(usuario);
      const { start, end } = limitesDelMes(`${mes}-01`);
      // Con una cuenta puesta se piden también los globales, para poder avisar
      // que existen sin mezclarlos en la lista.
      const [propios, globales] = await Promise.all([
        getBudgetProgress(d, start, end, currentLedger?.id),
        currentLedger ? getBudgetProgress(d, start, end, null) : Promise.resolve([]),
      ]);
      setBudgets(propios);
      setSinCuenta(globales);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    } finally {
      setCargando(false);
    }
  }, [usuario, mes, currentLedger]);

  useEffect(() => { cargar(); }, [cargar, transactionVersion]);

  /** Editar y mover son el mismo cambio: lo ausente se queda como está. */
  const editar = async (id: string, cambios: { amount?: number; ledger_id?: string | null }) => {
    if (!usuario) return false;
    setError('');
    try {
      await updateBudget(db(usuario), id, cambios);
      await cargar();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el cambio');
      return false;
    }
  };

  const moverMes = (delta: number) => {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMes(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  const guardar = async () => {
    if (!categoria || !monto || !usuario) return;
    setGuardando(true);
    setError('');
    try {
      // El tope se crea donde estás parado. Sin cuenta elegida queda global,
      // midiendo todo lo que gastás en esa categoría.
      await upsertBudget(db(usuario), categoria, Number(monto), currentLedger?.id ?? null);
      setCategoria('');
      setMonto('');
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = (id: string, cat: string) => {
    Alert.alert(`¿Eliminar el presupuesto de ${cat}?`, undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          if (!usuario) return;
          await deleteBudget(db(usuario), id);
          await cargar();
        },
      },
    ]);
  };

  // Solo gastos: un presupuesto es un tope de gasto, no de ingreso.
  const disponibles = categorias
    .filter(c => c.type === 'expense')
    .map(c => c.name)
    .filter((c, i, arr) => arr.indexOf(c) === i)
    .filter(c => !budgets.some(b => b.category === c))
    .sort((a, b) => a.localeCompare(b, 'es'));

  const crearCategoria = async () => {
    const nombre = nuevaCat.trim();
    if (!nombre || !usuario) return;
    setErrorCat('');
    try {
      // En la cuenta donde estás parado: las categorías son de la cuenta.
      const res = await createCategory(db(usuario), {
        ledger_id: currentLedger?.id ?? ledgers[0]?.id ?? '',
        name: nombre, type: 'expense',
      });
      if ('error' in res) { setErrorCat(res.error); return; }
      await refrescarCategorias();
      // Queda elegida, que es lo que venías a hacer.
      setCategoria(nombre);
      setNuevaCat('');
      setCreandoCat(false);
    } catch {
      setErrorCat('No se pudo crear');
    }
  };

  const totalTope = budgets.reduce((s, b) => s + b.amount, 0);
  const totalGastado = budgets.reduce((s, b) => s + b.spent, 0);
  const excedidos = budgets.filter(b => b.percent >= 100);

  return (
    <Pantalla className="gap-6" keyboardShouldPersistTaps="handled">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Texto className="text-xl font-semibold text-tinta">Presupuestos</Texto>
          <Texto className="text-tinta-2 text-sm" numberOfLines={1}>
            {currentLedger ? `Topes mensuales de ${currentLedger.name}` : 'Topes de todas tus cuentas'}
          </Texto>
        </View>
        <View className="flex-row items-center gap-1 pt-1">
          <Pressable onPress={() => moverMes(-1)} className="p-1">
            <ChevronLeft size={16} color={paleta.tinta2} />
          </Pressable>
          <Texto className="text-sm text-tinta-2 text-center" style={{ minWidth: 120 }}>
            {fmt.monthLabel(`${mes}-01`)}
          </Texto>
          <Pressable onPress={() => moverMes(1)} className="p-1">
            <ChevronRight size={16} color={paleta.tinta2} />
          </Pressable>
        </View>
      </View>

      {error ? (
        <View className="flex-row items-start gap-2 bg-peligro/10 border border-peligro/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><AlertCircle size={16} color={paleta.peligro} /></View>
          <Texto className="text-peligro text-sm flex-1">{error}</Texto>
        </View>
      ) : null}

      {/* Los que venían de antes de que el tope fuera de una cuenta. Se avisan
          en vez de mostrarse acá: mezclarlos es justo lo que hacía que un tope
          del hogar apareciera en la cuenta personal. */}
      {currentLedger && sinCuenta.length > 0 ? (
        <View className="bg-aviso/10 border border-aviso/20 rounded-2xl p-4 gap-3">
          <View className="flex-row items-start gap-2">
            <View className="mt-0.5"><AlertCircle size={16} color={paleta.aviso} /></View>
            <Texto className="text-sm text-aviso flex-1">
              {sinCuenta.length === 1 ? 'Tenés un presupuesto' : `Tenés ${sinCuenta.length} presupuestos`} sin
              cuenta asignada. Miden lo que gastás en todas tus cuentas juntas — asignalos para que cada
              tope cuente solo lo suyo.
            </Texto>
          </View>
          <View className="gap-2">
            {sinCuenta.map(b => (
              <View key={b.id} className="flex-row items-center gap-2">
                <Texto className="text-sm text-tinta flex-1" numberOfLines={1}>
                  {b.category} · {fmt.money(b.amount)}
                </Texto>
                <View style={{ width: 150 }}>
                  <Selector
                    titulo="Asignar a…"
                    value=""
                    placeholder="Asignar a…"
                    onChange={v => { if (v) editar(b.id, { ledger_id: v }); }}
                    opciones={ledgers.map(l => ({ valor: l.id, etiqueta: l.name }))}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {budgets.length > 0 ? (
        <View className="border-y border-linea py-4 gap-3">
          {/* Apilado en el teléfono: "RD$14,114.00 / RD$31,224.00" no entra al
              lado de la etiqueta, y el monto no puede achicarse por debajo de su
              contenido. Recién a partir de `sm` hay ancho para una sola línea. */}
          <View className="gap-1">
            <View>
              <Texto className="text-sm text-tinta">Total presupuestado</Texto>
              <Texto className="text-xs text-tinta-2">
                {excedidos.length > 0
                  ? `${excedidos.length} categoría${excedidos.length > 1 ? 's' : ''} pasada${excedidos.length > 1 ? 's' : ''} del tope`
                  : 'Todo dentro del tope'}
              </Texto>
            </View>
            <Texto className={`text-xl font-semibold ${budgetTone(totalTope > 0 ? Math.round((totalGastado / totalTope) * 100) : 0).text}`}
              style={{ fontVariant: ['tabular-nums'] }}>
              {fmt.money(totalGastado)}
              <Texto className="text-sm text-tinta-2"> / {fmt.money(totalTope)}</Texto>
            </Texto>
          </View>
        </View>
      ) : null}

      {/* Alta */}
      <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-4 gap-3">
        <View className="flex-row items-center gap-2">
          <Target size={16} color={paleta.tinta2} />
          <Texto className="text-sm font-medium text-tinta">Nuevo presupuesto</Texto>
        </View>
        <View className="gap-2">
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Selector
                titulo="Categoría"
                value={categoria}
                placeholder="Elegí una categoría"
                onChange={setCategoria}
                opciones={disponibles.map(c => ({ valor: c, etiqueta: c }))}
              />
            </View>
            <Pressable
              onPress={() => { setCreandoCat(v => !v); setErrorCat(''); }}
              className="px-3 py-2.5 bg-hundido active:bg-presionado rounded-lg justify-center"
            >
              <Plus size={16} color={paleta.tinta2} />
            </Pressable>
          </View>
          <TextInput
            value={monto}
            onChangeText={setMonto}
            keyboardType="decimal-pad"
            inputAccessoryViewID={TECLADO_CON_LISTO}
            placeholder="Tope mensual"
            className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta placeholder:text-tinta-3 focus:border-tinta-3"
            style={{ fontFamily: 'Inter_400Regular' }}
          />
          <Pressable
            onPress={guardar}
            disabled={guardando || !categoria || !monto}
            style={guardando || !categoria || !monto ? { opacity: 0.5 } : undefined}
            className="w-full py-2.5 bg-primario active:bg-primario/85 rounded-lg items-center"
          >
            <Texto className="text-sobre-primario text-sm font-medium">
              {guardando ? 'Guardando...' : 'Guardar'}
            </Texto>
          </Pressable>
        </View>

        {creandoCat ? (
          <View className="gap-2 pt-1">
            <View className="flex-row gap-2">
              <TextInput
                value={nuevaCat}
                onChangeText={setNuevaCat}
                onSubmitEditing={crearCategoria}
                placeholder="Nombre de la categoría"
                autoFocus
                maxLength={40}
                className="flex-1 bg-hundido border border-linea-fuerte rounded-lg px-3 py-2 text-sm text-tinta placeholder:text-tinta-3 focus:border-tinta-3"
                style={{ fontFamily: 'Inter_400Regular' }}
              />
              <Pressable onPress={crearCategoria} disabled={!nuevaCat.trim()}
                style={!nuevaCat.trim() ? { opacity: 0.5 } : undefined}
                className="px-4 py-2 bg-primario active:bg-primario/85 rounded-lg justify-center">
                <Texto className="text-sobre-primario text-sm font-medium">Crear</Texto>
              </Pressable>
            </View>
            {errorCat ? <Texto className="text-xs text-peligro">{errorCat}</Texto> : null}
            <Texto className="text-xs text-tinta-2">
              Se crea en esta cuenta. Podés renombrarla o borrarla desde Configuración.
            </Texto>
          </View>
        ) : null}

        {disponibles.length === 0 ? (
          <Texto className="text-xs text-tinta-2">
            Ya tenés un presupuesto para cada categoría de gasto.
          </Texto>
        ) : null}
      </View>

      {cargando ? (
        <View className="gap-2">
          {[0, 1, 2].map(i => (
            <View key={i} className="bg-hundido rounded-lg h-16" />
          ))}
        </View>
      ) : budgets.length === 0 ? (
        <View className="items-center py-12">
          <View className="w-12 h-12 rounded-full bg-hundido items-center justify-center mb-3">
            <Target size={20} color={paleta.tinta2} />
          </View>
          <Texto className="text-sm font-medium text-tinta">Todavía no tenés presupuestos</Texto>
          <Texto className="text-sm text-tinta-2 mt-1 text-center">
            Ponele un tope a una categoría y te aviso cuando te acerques.
          </Texto>
        </View>
      ) : (
        <View className="border-t border-linea">
          {budgets.map(b => (
            <Fila
              key={b.id}
              budget={b}
              ledgers={ledgers.map(l => ({ id: l.id, name: l.name }))}
              mostrarCuenta={!currentLedger}
              onEditar={cambios => editar(b.id, cambios)}
              onEliminar={() => eliminar(b.id, b.category)}
            />
          ))}
        </View>
      )}

      <Texto className="text-xs text-tinta-2 text-center">
        {currentLedger
          ? `El tope se compara contra los gastos del mes en ${currentLedger.name}, los tuyos y los de quien comparta la cuenta.`
          : 'Cada tope se compara contra los gastos del mes de su cuenta. Los que no tienen cuenta miden todas juntas.'}
        {' '}Si vinculaste WhatsApp, te aviso ahí mismo al anotar un gasto que te pase del tope.
      </Texto>
    </Pantalla>
  );
}

/**
 * Una fila de la lista, con su edición adentro.
 *
 * El tope se edita en el lugar y no en otra pantalla: es un número y una cuenta,
 * y mandar a otro lado para cambiar un monto es más viaje que trabajo.
 */
function Fila({ budget, ledgers, mostrarCuenta, onEditar, onEliminar }: {
  budget: BudgetProgress;
  ledgers: { id: string; name: string }[];
  mostrarCuenta: boolean;
  onEditar: (cambios: { amount?: number; ledger_id?: string | null }) => Promise<boolean>;
  onEliminar: () => void;
}) {
  const paleta = useColores();
  const [editando, setEditando] = useState(false);
  const [monto, setMonto] = useState(String(budget.amount));
  const [cuenta, setCuenta] = useState(budget.ledger_id ?? '');
  const [guardando, setGuardando] = useState(false);

  const abrir = () => {
    // Se relee al abrir: si se editó en otro lado, el formulario tiene que
    // arrancar con lo que hay, no con lo que había.
    setMonto(String(budget.amount));
    setCuenta(budget.ledger_id ?? '');
    setEditando(true);
  };

  const guardar = async () => {
    const n = Number(monto);
    if (!Number.isFinite(n) || n <= 0) return;
    setGuardando(true);
    const cambios: { amount?: number; ledger_id?: string | null } = {};
    if (n !== budget.amount) cambios.amount = n;
    if ((cuenta || null) !== budget.ledger_id) cambios.ledger_id = cuenta || null;

    // Sin cambios no se molesta al servidor: cerrar y listo.
    const ok = Object.keys(cambios).length === 0 ? true : await onEditar(cambios);
    setGuardando(false);
    if (ok) setEditando(false);
  };

  if (editando) {
    return (
      <View className="bg-hundido rounded-lg px-3 py-3.5 my-1 gap-3">
        <Texto className="text-sm text-tinta">{budget.category}</Texto>

        <View className="gap-1">
          <Texto className="text-xs text-tinta-2 leading-6">Tope mensual</Texto>
          <TextInput
            value={monto}
            onChangeText={setMonto}
            keyboardType="decimal-pad"
            inputAccessoryViewID={TECLADO_CON_LISTO}
            autoFocus
            className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta focus:border-tinta-3"
            style={{ fontFamily: 'Inter_400Regular' }}
          />
        </View>

        <View className="gap-1">
          <Texto className="text-xs text-tinta-2 leading-6">Cuenta</Texto>
          <Selector
            titulo="Cuenta"
            value={cuenta}
            placeholder="Sin cuenta — mide todas juntas"
            onChange={setCuenta}
            opciones={[
              { valor: '', etiqueta: 'Sin cuenta — mide todas juntas' },
              ...ledgers.map(l => ({ valor: l.id, etiqueta: l.name })),
            ]}
          />
        </View>

        <View className="flex-row gap-2">
          <Pressable onPress={() => setEditando(false)}
            className="flex-1 py-2.5 bg-hundido active:bg-presionado rounded-lg flex-row items-center justify-center gap-1.5">
            <X size={16} color={paleta.tinta} />
            <Texto className="text-tinta text-sm">Cancelar</Texto>
          </Pressable>
          <Pressable onPress={guardar} disabled={guardando || !monto}
            style={guardando || !monto ? { opacity: 0.5 } : undefined}
            className="flex-1 py-2.5 bg-primario active:bg-primario/85 rounded-lg flex-row items-center justify-center gap-1.5">
            {guardando ? <ActivityIndicator size="small" color={paleta.sobrePrimario} /> : <Check size={16} color={paleta.sobrePrimario} />}
            <Texto className="text-sobre-primario text-sm font-medium">Guardar</Texto>
          </Pressable>
        </View>

        {/* Borrar vive acá y no en la fila: en el teléfono los botones no se
            esconden con el puntero, y un tacho al lado del lápiz es un borrado
            a un toque de distancia. Además le devuelve ancho a la categoría. */}
        <Pressable onPress={onEliminar}
          className="w-full py-2 active:bg-peligro/10 rounded-lg flex-row items-center justify-center gap-1.5">
          <Trash2 size={14} color={paleta.peligro} />
          <Texto className="text-peligro text-xs">Eliminar este presupuesto</Texto>
        </Pressable>
      </View>
    );
  }

  return (
    // Una fila de la lista, como la web.
    <View className="border-b border-linea py-3.5 flex-row items-center gap-2">
      <View className="flex-1">
        <BarraDePresupuesto budget={budget} />
        {/* Solo en "todas las cuentas": mirando una, decirlo en cada fila es
            repetir lo que ya dice el encabezado. */}
        {mostrarCuenta ? (
          <Texto className="text-2xs text-tinta-2 mt-1">
            {budget.ledger_name ?? 'Todas las cuentas'}
          </Texto>
        ) : null}
      </View>
      {/* Un solo botón: en el teléfono no hay hover para esconderlos, así que
          cada uno le come ancho al nombre de la categoría de forma permanente. */}
      <Pressable onPress={abrir}
        accessibilityLabel={`Editar el presupuesto de ${budget.category}`}
        className="p-1.5 active:bg-hundido rounded-lg">
        <Pencil size={14} color={paleta.tinta2} />
      </Pressable>
    </View>
  );
}
