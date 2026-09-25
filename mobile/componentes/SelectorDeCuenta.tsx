import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Check, Crown, LayoutGrid, Pencil, Plus, Trash2, Users, X } from 'lucide-react-native';
import Texto from './Texto';
import MiembrosDeCuenta from './MiembrosDeCuenta';
import { useCuenta } from './ContextoDeCuenta';
import { useSesion } from './ContextoDeSesion';
import { useFormatters } from './ContextoDeAjustes';
import { db } from '../lib/datos';
import { createLedger, deleteLedger, updateLedger } from '@compartido/db';
import {
  CamposDeCuenta, COLORES_DE_CUENTA, leerCambiosDeCuenta, leerCuentaNueva,
} from '@compartido/cuentas-campos';
import { Ledger, LedgerColor, LedgerWithStats, LEDGER_COLOR_MAP } from '@compartido/types';
import { useColores } from '../lib/colores';

/**
 * El gemelo de components/LedgerSelector.tsx.
 *
 * Elegir la cuenta activa, crearlas, editarlas, borrarlas y ver quién tiene
 * acceso. Se abre desde la píldora de la barra de arriba, que es el único lugar
 * de la app donde se ve qué cuenta está activa.
 *
 * Va montado en la raíz y no en la barra, por lo mismo que el modal de
 * movimientos: un `Modal` de React Native se dibuja sobre la pantalla entera, y
 * dos abiertos a la vez se tapan entre ellos.
 */
export default function SelectorDeCuenta() {
  const paleta = useColores();
  const {
    currentLedger, setCurrentLedger, ledgers, refreshLedgers, selectorOpen, setSelectorOpen,
  } = useCuenta();
  const { session } = useSesion();
  const usuario = session?.user?.id ?? '';

  const [vista, setVista] = useState<'lista' | 'crear' | 'editar' | 'miembros'>('lista');
  const [editando, setEditando] = useState<LedgerWithStats | null>(null);
  const [miembrosDe, setMiembrosDe] = useState<LedgerWithStats | null>(null);
  const [errorBorrado, setErrorBorrado] = useState('');

  if (!selectorOpen) return null;

  const cerrar = () => {
    setSelectorOpen(false);
    setVista('lista');
    setEditando(null);
    setMiembrosDe(null);
    setErrorBorrado('');
  };

  const elegir = (ledger: Ledger | null) => {
    setCurrentLedger(ledger);
    cerrar();
  };

  const crear = async (datos: CamposDeCuenta) => {
    const leido = leerCuentaNueva(datos as Record<string, unknown>);
    if (!leido.ok) throw new Error(leido.error);
    await createLedger(db(usuario), leido.campos);
    await refreshLedgers();
    setVista('lista');
  };

  const editar = async (datos: CamposDeCuenta) => {
    if (!editando) return;
    const leido = leerCambiosDeCuenta(datos as Record<string, unknown>);
    if (!leido.ok) throw new Error(leido.error);
    const actualizada = await updateLedger(db(usuario), editando.id, leido.campos);
    if (!actualizada) throw new Error('Cuenta no encontrada');
    // La activa se actualiza a mano: su nombre y su color están en la barra de
    // arriba, y sin esto seguirían mostrando los viejos hasta recargar.
    if (currentLedger?.id === editando.id) setCurrentLedger({ ...currentLedger, ...leido.campos });
    await refreshLedgers();
    setVista('lista');
    setEditando(null);
  };

  const borrar = (ledger: LedgerWithStats) => {
    setErrorBorrado('');
    Alert.alert(`¿Eliminar la cuenta "${ledger.name}"?`, undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          const res = await deleteLedger(db(usuario), ledger.id);
          if (!res.ok) { setErrorBorrado(res.error ?? 'Error al eliminar'); return; }
          if (currentLedger?.id === ledger.id) setCurrentLedger(null);
          await refreshLedgers();
        },
      },
    ]);
  };

  const titulo = vista === 'crear' ? 'Nueva cuenta'
    : vista === 'editar' ? 'Editar cuenta'
    : vista === 'miembros' ? miembrosDe?.name ?? ''
    : 'Seleccionar cuenta';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={cerrar}>
      {/* La hoja sube desde abajo, como en la web debajo de 768px. */}
      <Pressable className="flex-1 bg-black/70" onPress={cerrar} />
      <View className="bg-panel border-t border-linea-fuerte rounded-t-2xl max-h-[90%]">
        <View className="flex-row items-center justify-between px-5 py-4 border-b border-linea">
          <Texto className="font-semibold text-tinta flex-1" numberOfLines={1}>{titulo}</Texto>
          <Pressable onPress={cerrar} accessibilityLabel="Cerrar">
            <X size={20} color={paleta.tinta2} />
          </Pressable>
        </View>

        <ScrollView contentContainerClassName="p-4 pb-8" keyboardShouldPersistTaps="handled">
          {vista === 'crear' ? (
            <FormularioDeCuenta onGuardar={crear} onCancelar={() => setVista('lista')} />
          ) : null}

          {vista === 'editar' && editando ? (
            <FormularioDeCuenta
              inicial={editando}
              onGuardar={editar}
              onCancelar={() => { setVista('lista'); setEditando(null); }}
            />
          ) : null}

          {vista === 'miembros' && miembrosDe ? (
            <MiembrosDeCuenta
              ledger={miembrosDe}
              onBack={() => { setVista('lista'); setMiembrosDe(null); }}
              onChanged={refreshLedgers}
            />
          ) : null}

          {vista === 'lista' ? (
            <View className="gap-5">
              {errorBorrado ? (
                <Texto className="text-peligro text-sm bg-peligro/10 border border-peligro/20 rounded-lg px-3 py-2">
                  {errorBorrado}
                </Texto>
              ) : null}

              {/* Sin cuentas, "Todas" no resume nada: lo único que corresponde
                  ofrecer es crear la primera. */}
              {ledgers.length === 0 ? (
                <View className="items-center gap-3 py-2">
                  <Texto className="text-sm text-tinta font-medium">Te quedaste sin cuentas</Texto>
                  <Texto className="text-xs text-tinta-2 text-center leading-relaxed">
                    Una cuenta agrupa tus movimientos: por ejemplo Hogar, Personal o Negocio.
                    Podés compartir cualquiera de ellas con otra persona.
                  </Texto>
                </View>
              ) : null}

              {/* Tres columnas, como el `grid-cols-3` de la web. En React Native
                  no hay grilla: el ancho va en porcentaje. */}
              <View className="flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
                {/* Vista global — solo tiene sentido si hay algo que agrupar */}
                {ledgers.length > 0 ? (
                  <Celda>
                    <Pressable
                      onPress={() => elegir(null)}
                      className="rounded-2xl overflow-hidden w-full"
                      style={{ aspectRatio: 3 / 4 }}
                    >
                      <View className="flex-1 bg-hundido items-center justify-center">
                        <LayoutGrid size={32} color={paleta.tinta2} />
                      </View>
                      {currentLedger === null ? <Tilde color={paleta.tinta} /> : null}
                    </Pressable>
                    <View className="px-0.5">
                      <Texto className="text-sm font-medium text-tinta">Todas</Texto>
                      <Texto className="text-xs text-tinta-2">Vista global</Texto>
                    </View>
                  </Celda>
                ) : null}

                {ledgers.map(l => (
                  <TarjetaDeCuenta
                    key={l.id}
                    ledger={l}
                    activa={currentLedger?.id === l.id}
                    onElegir={() => elegir(l)}
                    onEditar={() => { setEditando(l); setVista('editar'); }}
                    onBorrar={() => borrar(l)}
                    onMiembros={() => { setMiembrosDe(l); setVista('miembros'); }}
                  />
                ))}

                <Celda>
                  <Pressable
                    onPress={() => setVista('crear')}
                    className="w-full rounded-2xl border-2 border-dashed border-linea-fuerte items-center justify-center"
                    style={{ aspectRatio: 3 / 4 }}
                  >
                    <Plus size={32} color={paleta.tinta2} />
                  </Pressable>
                  <Texto className="text-sm text-tinta-2 px-0.5">Nueva cuenta</Texto>
                </Celda>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Un tercio del ancho, con su separación adentro. */
function Celda({ children }: { children: React.ReactNode }) {
  return (
    <View className="gap-2 px-1.5" style={{ width: `${100 / 3}%`, marginBottom: 12 }}>
      {children}
    </View>
  );
}

/** El tilde de "esta es la activa". */
function Tilde({ color }: { color: string }) {
  return (
    <View className="absolute top-2 right-2 w-6 h-6 bg-panel/90 rounded-full items-center justify-center">
      <Check size={14} color={color} />
    </View>
  );
}

function TarjetaDeCuenta({
  ledger, activa, onElegir, onEditar, onBorrar, onMiembros,
}: {
  ledger: LedgerWithStats;
  activa: boolean;
  onElegir: () => void;
  onEditar: () => void;
  onBorrar: () => void;
  onMiembros: () => void;
}) {
  const paleta = useColores();
  const color = LEDGER_COLOR_MAP[ledger.color];
  const fmt = useFormatters();
  const esDueno = ledger.role === 'owner';
  const compartida = ledger.memberCount > 1;

  return (
    <Celda>
      <Pressable
        onPress={onElegir}
        className="rounded-2xl overflow-hidden w-full flex-row"
        style={{ aspectRatio: 3 / 4 }}
      >
        {/* El corte duro al 28% de la web son dos vistas, no un degradado: es
            un cambio de color a mitad de camino, no una transición. */}
        <View style={{ flex: 28, backgroundColor: color.dark }} />
        <View style={{ flex: 72, backgroundColor: color.main }} />

        {activa ? <Tilde color={color.main} /> : null}

        {/* Cuántas personas tienen acceso */}
        {compartida ? (
          <View className="absolute top-2 left-2 flex-row items-center gap-1 bg-black/40 rounded-full px-1.5 py-0.5">
            <Users size={10} color="#ffffff" />
            <Texto className="text-3xs text-white font-medium">{ledger.memberCount}</Texto>
          </View>
        ) : null}

        <View className="absolute bottom-2 right-2 flex-row gap-1">
          <Boton onPress={onMiembros} etiqueta="Personas con acceso">
            <Users size={14} color={paleta.tinta} />
          </Boton>
          {esDueno ? (
            <>
              <Boton onPress={onEditar} etiqueta="Editar">
                <Pencil size={14} color={paleta.tinta} />
              </Boton>
              <Boton onPress={onBorrar} etiqueta="Eliminar" peligroso>
                <Trash2 size={14} color={paleta.tinta} />
              </Boton>
            </>
          ) : null}
        </View>
      </Pressable>

      <View className="px-0.5">
        <View className="flex-row items-center gap-1">
          <Texto className="text-sm font-medium text-tinta flex-1" numberOfLines={1}>{ledger.name}</Texto>
          {esDueno ? <Crown size={12} color={paleta.aviso} /> : null}
        </View>
        <Texto className={`text-xs font-semibold ${ledger.balance >= 0 ? 'text-acento' : 'text-peligro'}`}>
          {fmt.money(ledger.balance)}
        </Texto>
        <Texto className="text-xs text-tinta-2">{ledger.transactionCount} transacciones</Texto>
      </View>
    </Celda>
  );
}

/**
 * Uno de los botones de la esquina de la tarjeta.
 *
 * En la web cada uno hace `e.stopPropagation()` para que tocarlo no cuente
 * también como elegir la cuenta. Acá no hace falta: en React Native un
 * `Pressable` adentro de otro se queda con el toque y no lo propaga.
 */
function Boton({
  onPress, etiqueta, peligroso, children,
}: {
  onPress: () => void;
  etiqueta: string;
  peligroso?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={etiqueta}
      className={`w-7 h-7 bg-black/40 rounded-lg items-center justify-center ${
        peligroso ? 'active:bg-peligro/70' : 'active:bg-black/60'
      }`}
    >
      {children}
    </Pressable>
  );
}

function FormularioDeCuenta({
  inicial, onGuardar, onCancelar,
}: {
  inicial?: Partial<Ledger>;
  onGuardar: (datos: CamposDeCuenta) => Promise<void>;
  onCancelar: () => void;
}) {
  const paleta = useColores();
  const [name, setName] = useState(inicial?.name ?? '');
  const [color, setColor] = useState<LedgerColor>(inicial?.color ?? 'green');
  const [type, setType] = useState<'personal' | 'business'>(inicial?.type ?? 'personal');
  const [description, setDescription] = useState(inicial?.description ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    if (!name.trim()) { setError('El nombre es requerido'); return; }
    setGuardando(true);
    setError('');
    try {
      await onGuardar({ name: name.trim(), color, type, description });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
      setGuardando(false);
    }
  };

  return (
    <View className="gap-4">
      <View className="gap-1.5">
        <Texto className="text-xs text-tinta-2 font-medium">Nombre *</Texto>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ej: Personal, Negocio, Proyecto..."
          placeholderTextColor={paleta.tinta2}
          autoFocus
          className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-tinta text-sm"
        />
      </View>

      <View className="gap-1.5">
        <Texto className="text-xs text-tinta-2 font-medium">Tipo de categorías</Texto>
        <View className="flex-row gap-2">
          {(['personal', 'business'] as const).map(t => {
            const elegido = type === t;
            const caja = elegido
              ? 'bg-elevado border-2 border-tinta'
              : 'bg-hundido border-2 border-transparent';
            const letra = elegido
              ? 'text-tinta'
              : 'text-tinta-2';
            return (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                className={`flex-1 py-2 rounded-lg items-center ${caja}`}
              >
                <Texto className={`text-sm font-medium ${letra}`}>
                  {t === 'personal' ? 'Personal' : 'Negocio'}
                </Texto>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="gap-1.5">
        <Texto className="text-xs text-tinta-2 font-medium">Color</Texto>
        <View className="flex-row flex-wrap gap-2">
          {COLORES_DE_CUENTA.map(c => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              accessibilityLabel={`Color ${c}`}
              className={`w-8 h-8 rounded-full ${color === c ? 'border-2 border-tinta' : ''}`}
              style={[
                { backgroundColor: LEDGER_COLOR_MAP[c].main },
                color === c ? { transform: [{ scale: 1.1 }] } : null,
              ]}
            />
          ))}
        </View>
      </View>

      <View className="gap-1.5">
        <Texto className="text-xs text-tinta-2 font-medium">Descripción</Texto>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Opcional"
          placeholderTextColor={paleta.tinta2}
          className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-tinta text-sm"
        />
      </View>

      {error ? <Texto className="text-peligro text-sm">{error}</Texto> : null}

      <View className="flex-row gap-3 pt-1">
        <Pressable
          onPress={onCancelar}
          className="flex-1 py-2.5 bg-hundido active:bg-presionado rounded-lg items-center"
        >
          <Texto className="text-tinta text-sm">Cancelar</Texto>
        </Pressable>
        <Pressable
          onPress={guardar}
          disabled={guardando}
          style={guardando ? { opacity: 0.5 } : undefined}
          className="flex-1 py-2.5 bg-primario active:bg-primario/85 rounded-lg items-center"
        >
          <Texto className="text-sobre-primario text-sm font-medium">
            {guardando ? 'Guardando...' : 'Guardar'}
          </Texto>
        </Pressable>
      </View>
    </View>
  );
}
