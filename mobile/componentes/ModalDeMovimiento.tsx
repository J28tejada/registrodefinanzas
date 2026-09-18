import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { AlertCircle, ChevronDown, Plus, X } from 'lucide-react-native';
import Texto from './Texto';
import Selector from './Selector';
import CampoDeFecha from './CampoDeFecha';
import IconoDeCategoria from './IconoDeCategoria';
import { useCuenta } from './ContextoDeCuenta';
import { useSesion } from './ContextoDeSesion';
import { useCategorias } from './ContextoDeCategorias';
import { useFormatters } from './ContextoDeAjustes';
import { db } from '../lib/datos';
import { createCategory, createTransaction, getCards, updateTransaction } from '@compartido/db';
import {
  Card, CARD_GROUPS, CARD_KIND_LABEL, LEDGER_COLOR_MAP, Transaction, TransactionType,
} from '@compartido/types';

interface Borrador {
  ledger_id: string;
  type: TransactionType;
  amount: string;
  category: string;
  /** Vacío = sin subcategoría. Elegirla es siempre opcional. */
  subcategory: string;
  description: string;
  date: string;
  /** Vacío = sin especificar. No es obligatorio: muchos gastos no lo tienen. */
  card_id: string;
}

/**
 * El gemelo de components/AddTransactionModal.tsx.
 *
 * Lo que NO se pudo portar: la entrada por voz. La web usa la API de
 * reconocimiento del navegador, que en React Native no existe — haría falta
 * grabar con el micrófono y mandar el audio a transcribir, que es otra pieza y
 * otra decisión. Por ahora el bloque no aparece, en lugar de aparecer roto.
 */
export default function ModalDeMovimiento({
  visible, onClose, onGuardado, editando,
}: {
  visible: boolean;
  onClose: () => void;
  onGuardado: () => void;
  editando?: Transaction | null;
}) {
  const { currentLedger, ledgers, setSelectorOpen } = useCuenta();
  const { session } = useSesion();
  const { para, subDe, refrescar: refrescarCategorias, cargando: cargandoCats, error: errorCats } = useCategorias();
  const fmt = useFormatters();
  const usuario = session?.user?.id;

  const cuentaPorDefecto = currentLedger?.id ?? ledgers[0]?.id ?? '';
  const vacio: Borrador = {
    ledger_id: cuentaPorDefecto, type: 'expense', amount: '', category: '',
    subcategory: '', description: '',
    // "Hoy" en la zona del usuario, no en la del teléfono.
    date: fmt.today(), card_id: '',
  };

  const [form, setForm] = useState<Borrador>(vacio);
  const [cards, setCards] = useState<Card[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [categoriasAbiertas, setCategoriasAbiertas] = useState(false);
  const [creandoCategoria, setCreandoCategoria] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editando) {
      setForm({
        ledger_id: editando.ledger_id ?? cuentaPorDefecto,
        type: editando.type,
        amount: String(editando.amount),
        category: editando.category,
        subcategory: editando.subcategory ?? '',
        description: editando.description,
        date: editando.date,
        card_id: editando.card_id ?? '',
      });
    } else {
      setForm({ ...vacio, date: fmt.today(), ledger_id: cuentaPorDefecto });
    }
    setError('');
    setCategoriasAbiertas(false);
    setCreandoCategoria(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando, visible, cuentaPorDefecto]);

  useEffect(() => {
    if (!visible || !usuario) return;
    getCards(db(usuario)).then(setCards).catch(() => setCards([]));
  }, [visible, usuario]);

  // Las de la cuenta elegida: cada cuenta tiene su propia lista.
  const categorias = para(form.type);
  const elegida = categorias.find(c => c.name === form.category) ?? null;
  const subcategorias = elegida ? subDe(elegida.id) : [];
  const cuentaElegida = ledgers.find(l => l.id === form.ledger_id);

  const guardar = async () => {
    if (!usuario) return;
    if (!form.amount || !form.category) { setError('Completa todos los campos requeridos'); return; }
    // Sin cuenta el movimiento queda huérfano: no aparece en ninguna vista de
    // cuenta ni suma a ningún saldo.
    if (!form.ledger_id) {
      setError(ledgers.length === 0
        ? 'Primero creá una cuenta para poder anotar movimientos.'
        : 'Elegí una cuenta');
      return;
    }

    setGuardando(true);
    setError('');
    try {
      const d = db(usuario);
      const cuenta = ledgers.find(l => l.id === form.ledger_id);
      const datos = {
        ledger_id: form.ledger_id,
        type: form.type,
        scope: (cuenta?.type ?? 'personal') as 'personal' | 'business',
        amount: parseFloat(form.amount),
        category: form.category,
        subcategory: form.subcategory || null,
        description: form.description,
        date: form.date,
        card_id: form.card_id || null,
        // El texto acompaña a la FK: si más adelante se borra la tarjeta, el
        // movimiento conserva con qué se pagó.
        payment_method: form.card_id ? (cards.find(c => c.id === form.card_id)?.name ?? null) : null,
        source: 'manual' as const,
        receipt_url: null,
      };
      if (editando) await updateTransaction(d, editando.id, datos);
      else await createTransaction(d, datos);
      onGuardado();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-end">
        <View className="bg-slate-900 rounded-t-2xl max-h-[92%]">
          {/* La cabecera se queda arriba mientras el formulario scrollea. */}
          <View className="bg-slate-900 border-b border-slate-800 px-5 py-4 flex-row items-center justify-between rounded-t-2xl">
            <Texto className="font-semibold text-white">
              {editando ? 'Editar registro' : 'Nuevo registro'}
            </Texto>
            <Pressable onPress={onClose}><X size={20} color="#94a3b8" /></Pressable>
          </View>

          <ScrollView contentContainerClassName="p-4 pb-8 gap-4" keyboardShouldPersistTaps="handled">
            {/* Cada usuario arranca con una cuenta personal, así que esto casi
                nunca aparece: queda por si la borró y se quedó sin ninguna. */}
            {ledgers.length === 0 ? (
              <View className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 gap-3">
                <Texto className="text-sm text-amber-200">
                  Te quedaste sin cuentas. Creá una para poder anotar movimientos.
                </Texto>
                <Pressable
                  onPress={() => { onClose(); setSelectorOpen(true); }}
                  className="w-full py-2.5 bg-emerald-600 active:bg-emerald-500 rounded-lg items-center"
                >
                  <Texto className="text-white text-sm font-medium">Crear mi primera cuenta</Texto>
                </Pressable>
              </View>
            ) : (
              <View className="gap-1.5">
                <Texto className="text-xs text-slate-400 font-medium leading-6">CUENTA</Texto>
                <Selector
                  titulo="Cuenta"
                  value={form.ledger_id}
                  onChange={v => setForm(p => ({ ...p, ledger_id: v, category: '', subcategory: '' }))}
                  opciones={ledgers.map(l => ({
                    valor: l.id, etiqueta: l.name, color: LEDGER_COLOR_MAP[l.color].main,
                  }))}
                />
              </View>
            )}

            <View className="gap-1.5">
              <Texto className="text-xs text-slate-400 font-medium leading-6">TIPO</Texto>
              <View className="flex-row gap-2">
                {(['expense', 'income'] as const).map(t => {
                  const activo = form.type === t;
                  const caja = !activo ? 'bg-slate-800 border-2 border-transparent'
                    : t === 'expense' ? 'bg-rose-500/20 border-2 border-rose-500'
                    : 'bg-emerald-500/20 border-2 border-emerald-500';
                  const color = !activo ? 'text-slate-400'
                    : t === 'expense' ? 'text-rose-300' : 'text-emerald-300';
                  return (
                    <Pressable
                      key={t}
                      // Al pasar a ingreso se suelta la tarjeta: si no, la elegida
                      // como gasto se guardaría igual, con el campo ya oculto.
                      onPress={() => setForm(p => ({
                        ...p, type: t, category: '', subcategory: '',
                        card_id: t === 'income' ? '' : p.card_id,
                      }))}
                      className={`flex-1 py-2.5 rounded-lg items-center ${caja}`}
                    >
                      <Texto className={`text-sm font-medium ${color}`}>
                        {t === 'expense' ? '− Gasto' : '+ Ingreso'}
                      </Texto>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View className="gap-1.5">
              <Texto className="text-xs text-slate-400 font-medium leading-6">MONTO *</Texto>
              <View className="relative">
                <View className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                  <Texto className="text-slate-500 text-sm">$</Texto>
                </View>
                <TextInput
                  value={form.amount}
                  onChangeText={v => setForm(p => ({ ...p, amount: v }))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500"
                  style={{ fontFamily: 'Inter_400Regular' }}
                />
              </View>
            </View>

            {/* Categoría: cerrada por defecto. La grilla se lleva media pantalla
                y empuja fecha, descripción y medio de pago fuera de la vista. */}
            <View className="gap-1.5">
              <Texto className="text-xs text-slate-400 font-medium leading-6">CATEGORÍA *</Texto>
              <Pressable
                onPress={() => setCategoriasAbiertas(v => !v)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 flex-row items-center gap-2.5"
              >
                {elegida
                  ? <IconoDeCategoria icon={elegida.icon} color={elegida.color} type={elegida.type} size="sm" />
                  : <View className="w-8 h-8" />}
                <Texto className={`flex-1 text-sm ${form.category ? 'text-white' : 'text-slate-500'}`} numberOfLines={1}>
                  {form.category || 'Seleccionar categoría'}
                </Texto>
                <ChevronDown size={16} color="#94a3b8" />
              </Pressable>

              {categoriasAbiertas ? (
                <ScrollView className="max-h-56" contentContainerClassName="pt-2 pr-1"
                  nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {/* Tres columnas, como en la web: con cuatro la celda queda en
                      58px y "Combustible" se parte al medio. */}
                  <View className="flex-row flex-wrap">
                    {categorias.map(cat => {
                      const esta = form.category === cat.name;
                      return (
                        <Pressable
                          key={cat.id}
                          onPress={() => {
                            // Cambiar de categoría borra la subcategoría: la de
                            // Alimentación no significa nada bajo Transporte.
                            setForm(p => ({ ...p, category: cat.name, subcategory: '' }));
                            setCategoriasAbiertas(false);
                          }}
                          className={`w-1/3 items-center gap-1.5 rounded-lg py-1.5 mb-3 ${
                            esta ? 'bg-emerald-500/10' : ''
                          }`}
                        >
                          <IconoDeCategoria icon={cat.icon} color={cat.color} type={cat.type} size="sm" />
                          <Texto className={`text-2xs leading-tight text-center px-0.5 ${
                            esta ? 'text-emerald-300' : 'text-slate-300'
                          }`} numberOfLines={2}>
                            {cat.name}
                          </Texto>
                        </Pressable>
                      );
                    })}

                    {/* Crear una acá mismo. Antes había que salir a Configuración,
                        volver y empezar de nuevo el movimiento. */}
                    <Pressable
                      onPress={() => { setCreandoCategoria(true); setCategoriasAbiertas(false); }}
                      className="w-1/3 items-center gap-1.5 rounded-lg py-1.5 mb-3"
                    >
                      <View className="w-8 h-8 rounded-full border border-dashed border-slate-600 items-center justify-center">
                        <Plus size={16} color="#64748b" />
                      </View>
                      <Texto className="text-2xs leading-tight text-center text-slate-400">Nueva</Texto>
                    </Pressable>
                  </View>
                </ScrollView>
              ) : null}

              {creandoCategoria ? (
                <NuevaCategoria
                  type={form.type}
                  ledgerId={form.ledger_id}
                  onCreada={async nombre => {
                    await refrescarCategorias();
                    setForm(p => ({ ...p, category: nombre, subcategory: '' }));
                    setCreandoCategoria(false);
                  }}
                  onCancelar={() => setCreandoCategoria(false)}
                />
              ) : null}

              {/* El segundo nivel, solo si la categoría elegida tiene. */}
              {subcategorias.length > 0 ? (
                <View className="pt-1 gap-1.5">
                  <Texto className="text-2xs text-slate-500">Detalle (opcional)</Texto>
                  <View className="flex-row flex-wrap gap-1.5">
                    {subcategorias.map(sub => {
                      const esta = form.subcategory === sub.name;
                      return (
                        <Pressable
                          key={sub.id}
                          // Volver a tocar la elegida la saca: es opcional, así
                          // que tiene que poder deshacerse.
                          onPress={() => setForm(p => ({ ...p, subcategory: esta ? '' : sub.name }))}
                          className={`px-2.5 py-1.5 rounded-lg border ${
                            esta ? 'bg-emerald-500/15 border-emerald-500/40' : 'bg-slate-800 border-slate-700'
                          }`}
                        >
                          <Texto className={`text-xs ${esta ? 'text-emerald-300' : 'text-slate-300'}`}>
                            {sub.name}
                          </Texto>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {errorCats ? <Texto className="text-xs text-rose-400 mt-1">{errorCats}</Texto> : null}
              {!errorCats && !cargandoCats && categorias.length === 0 ? (
                <Texto className="text-xs text-amber-400 mt-1">
                  Esta cuenta no tiene categorías. Creá una en Configuración → Categorías.
                </Texto>
              ) : null}
            </View>

            {/* Descripción: opcional. Muchos gastos no tienen nada que agregarle
                al nombre de la categoría. */}
            <View className="gap-1.5">
              <Texto className="text-xs text-slate-400 font-medium leading-6">DESCRIPCIÓN</Texto>
              <TextInput
                value={form.description}
                onChangeText={v => setForm(p => ({ ...p, description: v }))}
                placeholder={form.category ? `Opcional — se anota como "${form.category}"` : 'Opcional'}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500"
                style={{ fontFamily: 'Inter_400Regular' }}
              />
            </View>

            <View className="gap-1.5">
              <Texto className="text-xs text-slate-400 font-medium leading-6">FECHA *</Texto>
              <CampoDeFecha
                value={form.date}
                onChange={v => setForm(p => ({ ...p, date: v }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5"
              />
            </View>

            {/* Con qué se pagó. Opcional, y solo en gastos: un ingreso no se paga
                con nada, y el gasto por tarjeta sale de `spent_by_card`, que
                cuenta únicamente gastos. */}
            {form.type === 'expense' && cards.length > 0 ? (
              <View className="gap-1.5">
                <Texto className="text-xs text-slate-400 font-medium leading-6">PAGADO CON</Texto>
                <Selector
                  titulo="Pagado con"
                  value={form.card_id}
                  onChange={v => setForm(p => ({ ...p, card_id: v }))}
                  placeholder="Sin especificar"
                  opciones={[
                    { valor: '', etiqueta: 'Sin especificar' },
                    ...CARD_GROUPS.flatMap(({ titulo, kinds }) =>
                      cards.filter(c => kinds.includes(c.kind)).map(c => ({
                        valor: c.id,
                        etiqueta: `${c.name}${c.last4 ? ` ···· ${c.last4}` : ''}`,
                        grupo: titulo,
                      }))),
                  ]}
                />
              </View>
            ) : null}

            {error ? (
              <View className="flex-row items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                <AlertCircle size={16} color="#fb7185" />
                <Texto className="text-rose-400 text-sm flex-1">{error}</Texto>
              </View>
            ) : null}

            <View className="flex-row gap-3 pt-1">
              <Pressable onPress={onClose}
                className="flex-1 py-2.5 bg-slate-800 active:bg-slate-700 rounded-lg items-center">
                <Texto className="text-slate-300 text-sm">Cancelar</Texto>
              </Pressable>
              <Pressable
                onPress={guardar}
                disabled={guardando || ledgers.length === 0}
                style={guardando || ledgers.length === 0 ? { opacity: 0.5 } : undefined}
                className="flex-1 py-2.5 bg-emerald-600 active:bg-emerald-500 rounded-lg flex-row items-center justify-center gap-2"
              >
                {guardando ? <ActivityIndicator size="small" color="#ffffff" /> : null}
                <Texto className="text-white text-sm font-medium">
                  {guardando ? 'Guardando...' : 'Guardar'}
                </Texto>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Alta de una categoría sin salir del formulario.
 *
 * Solo nombre: el ícono lo adivina la API del nombre y el color queda en el del
 * tipo. Estás anotando un gasto, no configurando la app.
 */
function NuevaCategoria({ type, ledgerId, onCreada, onCancelar }: {
  type: TransactionType;
  ledgerId: string;
  onCreada: (nombre: string) => void | Promise<void>;
  onCancelar: () => void;
}) {
  const { session } = useSesion();
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const crear = async () => {
    const name = nombre.trim();
    if (!name || !session?.user?.id) return;
    setGuardando(true);
    setError('');
    try {
      const res = await createCategory(db(session.user.id), { ledger_id: ledgerId, name, type });
      if ('error' in res) { setError(res.error); return; }
      await onCreada(name);
    } catch {
      setError('No se pudo crear');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <View className="border border-slate-800 rounded-lg p-2.5 gap-2 bg-slate-950/40">
      <View className="flex-row gap-2">
        <TextInput
          value={nombre}
          onChangeText={setNombre}
          onSubmitEditing={crear}
          placeholder="Nombre de la categoría"
          autoFocus
          maxLength={40}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500"
          style={{ fontFamily: 'Inter_400Regular' }}
        />
        <Pressable onPress={crear} disabled={guardando || !nombre.trim()}
          style={guardando || !nombre.trim() ? { opacity: 0.5 } : undefined}
          className="px-3 py-2 bg-emerald-600 active:bg-emerald-500 rounded-lg justify-center">
          {guardando ? <ActivityIndicator size="small" color="#fff" />
            : <Texto className="text-white text-sm">Crear</Texto>}
        </Pressable>
        <Pressable onPress={onCancelar} className="px-2 py-2 justify-center">
          <X size={16} color="#94a3b8" />
        </Pressable>
      </View>
      {error ? <Texto className="text-xs text-rose-400">{error}</Texto> : null}
    </View>
  );
}
