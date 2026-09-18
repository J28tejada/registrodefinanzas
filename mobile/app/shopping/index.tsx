import { useCallback, useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import {
  AlertCircle, Check, ChevronRight, ClipboardList, Loader2, Plus, ShoppingCart,
} from 'lucide-react-native';
import Texto from '../../componentes/Texto';
import Pantalla from '../../componentes/Pantalla';
import Selector from '../../componentes/Selector';
import { useCuenta } from '../../componentes/ContextoDeCuenta';
import { useSesion } from '../../componentes/ContextoDeSesion';
import { useFormatters } from '../../componentes/ContextoDeAjustes';
import { db } from '../../lib/datos';
import {
  createShoppingList, getShoppingLists, getShoppingTrips, iniciarCompra,
} from '@compartido/db';
import { ShoppingListWithTotals, ShoppingTripWithTotals } from '@compartido/types';

/**
 * El gemelo de app/shopping/page.tsx.
 *
 * Dos cosas separadas en una pantalla, y el orden importa. Arriba la COMPRA,
 * que es lo que se hace parado en el súper con el teléfono en una mano. Abajo
 * las LISTAS, que son las plantillas y se editan sentado en casa.
 */
export default function Supermercado() {
  const fmt = useFormatters();
  const router = useRouter();
  const { currentLedger, ledgers } = useCuenta();
  const { session } = useSesion();
  const usuario = session?.user?.id;

  const [trips, setTrips] = useState<ShoppingTripWithTotals[]>([]);
  const [lists, setLists] = useState<ShoppingListWithTotals[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [verCerradas, setVerCerradas] = useState(false);

  const [iniciando, setIniciando] = useState(false);
  const [creandoLista, setCreandoLista] = useState(false);
  const [nombreLista, setNombreLista] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cuentaId = currentLedger?.id ?? ledgers[0]?.id ?? null;

  const cargar = useCallback(async () => {
    if (!usuario) return;
    setCargando(true);
    try {
      const datos = db(usuario);
      const [t, l] = await Promise.all([
        getShoppingTrips(datos, {
          ledgerId: currentLedger?.id ?? null, incluirCerradas: verCerradas,
        }),
        getShoppingLists(datos, currentLedger?.id ?? null),
      ]);
      setTrips(t);
      setLists(l);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar');
    } finally {
      setCargando(false);
    }
  }, [usuario, currentLedger, verCerradas]);

  useEffect(() => { cargar(); }, [cargar]);

  const crearLista = async () => {
    const name = nombreLista.trim();
    if (!name || !usuario) return;
    setGuardando(true);
    setError('');
    try {
      const lista = await createShoppingList(db(usuario), { name, ledger_id: cuentaId });
      setNombreLista('');
      setCreandoLista(false);
      router.push(`/shopping/lista/${lista.id}` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear');
    } finally {
      setGuardando(false);
    }
  };

  const enCurso = trips.filter(t => !t.closed);
  const cerradas = trips.filter(t => t.closed);

  return (
    <Pantalla className="gap-5" keyboardShouldPersistTaps="handled">
      <View>
        <Texto className="text-xl font-bold text-white">Supermercado</Texto>
        <Texto className="text-slate-400 text-sm" numberOfLines={1}>
          Las listas son la plantilla; la compra es lo que pasó de verdad
        </Texto>
      </View>

      {error ? (
        <View className="flex-row items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><AlertCircle size={16} color="#fb7185" /></View>
          <Texto className="text-rose-400 text-sm flex-1">{error}</Texto>
        </View>
      ) : null}

      {/* ── La compra ── */}
      <View className="gap-2">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-row items-center gap-2">
            <ShoppingCart size={16} color="#34d399" />
            <Texto className="text-sm font-medium text-white">Compras</Texto>
          </View>
          {!iniciando ? (
            <Pressable
              onPress={() => setIniciando(true)}
              className="px-3 py-1.5 bg-emerald-600 active:bg-emerald-500 rounded-lg flex-row items-center gap-1.5"
            >
              <Plus size={14} color="#ffffff" />
              <Texto className="text-white text-xs font-medium">Ir al súper</Texto>
            </Pressable>
          ) : null}
        </View>

        {iniciando && usuario ? (
          <IniciarCompra
            usuario={usuario}
            listas={lists}
            cuentaId={cuentaId}
            hoy={fmt.today()}
            onCancelar={() => setIniciando(false)}
            onCreada={id => router.push(`/shopping/compra/${id}` as never)}
          />
        ) : null}

        {cargando ? (
          <View className="h-20 bg-slate-900 border border-slate-800 rounded-2xl" />
        ) : enCurso.length === 0 && cerradas.length === 0 ? (
          <Texto className="text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-6 text-center">
            Ninguna compra todavía. Cuando vayas al súper, arrancá una desde una lista.
          </Texto>
        ) : (
          <>
            {enCurso.map(t => <TarjetaCompra key={t.id} compra={t} fmt={fmt} />)}
            {cerradas.length > 0 ? (
              <View className="gap-2 pt-1">
                <Texto className="text-xs text-slate-500 uppercase tracking-wider">Ya compradas</Texto>
                {cerradas.map(t => <TarjetaCompra key={t.id} compra={t} fmt={fmt} />)}
              </View>
            ) : null}
          </>
        )}

        <Pressable onPress={() => setVerCerradas(v => !v)}>
          <Texto className="text-xs text-slate-500">
            {verCerradas ? 'Ver solo las que están en curso' : 'Ver también las ya compradas'}
          </Texto>
        </Pressable>
      </View>

      {/* ── Las plantillas ── */}
      <View className="gap-2 pt-2">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-row items-center gap-2">
            <ClipboardList size={16} color="#94a3b8" />
            <Texto className="text-sm font-medium text-white">Mis listas</Texto>
          </View>
          {!creandoLista ? (
            <Pressable
              onPress={() => setCreandoLista(true)}
              accessibilityLabel="Crear una lista"
              className="p-1.5 bg-slate-800 active:bg-slate-700 rounded-lg"
            >
              <Plus size={14} color="#cbd5e1" />
            </Pressable>
          ) : null}
        </View>
        <Texto className="text-xs text-slate-500">
          Lo que solés comprar, con precios de referencia. No se ensucian al ir al súper.
        </Texto>

        {creandoLista ? (
          <View className="bg-slate-900 border border-slate-800 rounded-2xl p-3 gap-2">
            <TextInput
              value={nombreLista}
              onChangeText={setNombreLista}
              onSubmitEditing={crearLista}
              placeholder="Nombre — ej: Compra de la quincena"
              placeholderTextColor="#64748b"
              autoFocus
              maxLength={60}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
            />
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => { setCreandoLista(false); setNombreLista(''); }}
                className="flex-1 py-2 bg-slate-800 active:bg-slate-700 rounded-lg items-center"
              >
                <Texto className="text-slate-300 text-sm">Cancelar</Texto>
              </Pressable>
              <Pressable
                onPress={crearLista}
                disabled={guardando || !nombreLista.trim()}
                style={guardando || !nombreLista.trim() ? { opacity: 0.5 } : undefined}
                className="flex-1 py-2 bg-emerald-600 active:bg-emerald-500 rounded-lg flex-row items-center justify-center gap-2"
              >
                {guardando ? <Loader2 size={16} color="#ffffff" /> : <Plus size={16} color="#ffffff" />}
                <Texto className="text-white text-sm font-medium">Crear</Texto>
              </Pressable>
            </View>
          </View>
        ) : null}

        {!cargando && lists.length === 0 && !creandoLista ? (
          <Texto className="text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-6 text-center">
            Todavía no tenés ninguna lista.
          </Texto>
        ) : null}

        {lists.map(l => (
          <Link key={l.id} href={`/shopping/lista/${l.id}` as never} asChild>
            <Pressable className="bg-slate-900 border border-slate-800 active:border-slate-700 rounded-2xl px-4 py-3">
              <View className="flex-row items-center gap-3">
                <View className="flex-1">
                  <Texto className="text-sm text-white" numberOfLines={1}>{l.name}</Texto>
                  <Texto className="text-xs text-slate-500">
                    {l.items} {l.items === 1 ? 'artículo' : 'artículos'}
                  </Texto>
                </View>
                <Texto className="text-sm text-slate-400">{fmt.money(l.total)}</Texto>
                <ChevronRight size={16} color="#475569" />
              </View>
            </Pressable>
          </Link>
        ))}
      </View>
    </Pantalla>
  );
}

// ─── Arrancar una compra ──────────────────────────────────────────────────────

function IniciarCompra({
  usuario, listas, cuentaId, hoy, onCancelar, onCreada,
}: {
  usuario: string;
  listas: ShoppingListWithTotals[];
  cuentaId: string | null;
  hoy: string;
  onCancelar: () => void;
  onCreada: (id: string) => void;
}) {
  const [listaId, setListaId] = useState(listas[0]?.id ?? '');
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const arrancar = async () => {
    setGuardando(true);
    setError('');
    try {
      const elegida = listas.find(l => l.id === listaId);
      const res = await iniciarCompra(db(usuario), {
        // Sin nombre propio hereda el de la lista: nadie quiere escribir un
        // título cuando ya está entrando al supermercado.
        name: nombre.trim() || elegida?.name || 'Compra',
        date: hoy,
        ledger_id: cuentaId,
        list_id: listaId || null,
      });
      if (!res.ok) { setError(res.error); return; }
      onCreada(res.compra.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <View className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4 gap-3">
      <Texto className="text-sm font-medium text-white">Empezar una compra</Texto>

      <View className="gap-1">
        <Texto className="text-xs text-slate-500 leading-6">Desde qué lista</Texto>
        <Selector
          value={listaId}
          opciones={[
            { valor: '', etiqueta: 'Empezar en blanco' },
            ...listas.map(l => ({ valor: l.id, etiqueta: `${l.name} · ${l.items} art.` })),
          ]}
          onChange={setListaId}
          titulo="Desde qué lista"
        />
        <Texto className="text-xs text-slate-500">
          Se copian sus artículos. Lo que cambies acá no toca la lista.
        </Texto>
      </View>

      <TextInput
        value={nombre}
        onChangeText={setNombre}
        placeholder="Nombre de la compra (opcional)"
        placeholderTextColor="#64748b"
        maxLength={60}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
      />

      {error ? <Texto className="text-xs text-rose-400">{error}</Texto> : null}

      <View className="flex-row gap-2">
        <Pressable
          onPress={onCancelar}
          className="flex-1 py-2.5 bg-slate-800 active:bg-slate-700 rounded-lg items-center"
        >
          <Texto className="text-slate-300 text-sm">Cancelar</Texto>
        </Pressable>
        <Pressable
          onPress={arrancar}
          disabled={guardando}
          style={guardando ? { opacity: 0.5 } : undefined}
          className="flex-1 py-2.5 bg-emerald-600 active:bg-emerald-500 rounded-lg flex-row items-center justify-center gap-2"
        >
          {guardando ? <Loader2 size={16} color="#ffffff" /> : <ShoppingCart size={16} color="#ffffff" />}
          <Texto className="text-white text-sm font-medium">Empezar</Texto>
        </Pressable>
      </View>
    </View>
  );
}

function TarjetaCompra({
  compra, fmt,
}: {
  compra: ShoppingTripWithTotals;
  fmt: { money: (n: number) => string };
}) {
  const avance = compra.total > 0 ? Math.round((compra.checkedTotal / compra.total) * 100) : 0;
  const pagado = compra.closed && compra.paid_amount != null ? compra.paid_amount : compra.checkedTotal;
  const desvio = compra.closed ? pagado - compra.plannedTotal : 0;

  return (
    <Link href={`/shopping/compra/${compra.id}` as never} asChild>
      <Pressable className="bg-slate-900 border border-slate-800 active:border-slate-700 rounded-2xl px-4 py-3.5">
        <View className="flex-row items-center gap-3">
          <View className={`w-9 h-9 rounded-xl items-center justify-center ${
            compra.closed ? 'bg-slate-800' : 'bg-emerald-500/10'
          }`}>
            {compra.closed
              ? <Check size={16} color="#94a3b8" />
              : <ShoppingCart size={16} color="#34d399" />}
          </View>
          <View className="flex-1">
            <Texto className="text-sm text-white" numberOfLines={1}>{compra.name}</Texto>
            <Texto className="text-xs text-slate-500">
              {compra.checkedItems} de {compra.items} artículos · {compra.date}
            </Texto>
          </View>
          <View className="items-end">
            <Texto className="text-sm font-semibold text-white">{fmt.money(pagado)}</Texto>
            {/* Cerrada: lo pagado contra lo que decía la lista. Es el dato que
                se viene a buscar después. */}
            {compra.closed && Math.abs(desvio) >= 0.01 && compra.plannedTotal > 0 ? (
              <Texto className={`text-2xs ${desvio > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {desvio > 0 ? '+' : '−'}{fmt.money(Math.abs(desvio))} vs lista
              </Texto>
            ) : null}
            {!compra.closed && compra.total !== compra.checkedTotal ? (
              <Texto className="text-2xs text-slate-500">de {fmt.money(compra.total)}</Texto>
            ) : null}
          </View>
          <ChevronRight size={16} color="#475569" />
        </View>

        {!compra.closed && compra.items > 0 ? (
          <View className="h-1 bg-slate-800 rounded-full overflow-hidden mt-2.5">
            <View className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(avance, 100)}%` }} />
          </View>
        ) : null}
      </Pressable>
    </Link>
  );
}
