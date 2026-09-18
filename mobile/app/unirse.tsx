import { useEffect, useState } from 'react';
import { TextInput, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle, Check, Loader2, Users } from 'lucide-react-native';
import Texto from '../componentes/Texto';
import Pantalla from '../componentes/Pantalla';
import { useCuenta } from '../componentes/ContextoDeCuenta';
import { useSesion } from '../componentes/ContextoDeSesion';
import { db } from '../lib/datos';
import { acceptInvite, peekInvite } from '@compartido/db';

/**
 * El gemelo de app/unirse/page.tsx.
 *
 * Sin `Suspense`: en la web envuelve a `useSearchParams`, que obliga a Next a
 * esperar del lado del cliente. `useLocalSearchParams` de expo-router devuelve
 * lo que haya sin suspender, así que no hay nada que envolver.
 */
export default function Unirse() {
  const router = useRouter();
  const { codigo: delEnlace } = useLocalSearchParams<{ codigo?: string }>();
  const { session } = useSesion();
  const { refreshLedgers } = useCuenta();
  const usuario = session?.user?.id;

  const [codigo, setCodigo] = useState('');
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [uniendo, setUniendo] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);

  // El enlace compartido trae el código puesto
  useEffect(() => {
    if (delEnlace) setCodigo(delEnlace.toUpperCase().slice(0, 6));
  }, [delEnlace]);

  // Con el código completo, buscar a qué cuenta pertenece
  useEffect(() => {
    if (codigo.length !== 6 || !usuario) { setCuenta(null); setError(''); return; }

    let cancelado = false;
    setVerificando(true);
    peekInvite(db(usuario), codigo)
      .then(invitacion => {
        if (cancelado) return;
        if (!invitacion) { setError('Código inválido o vencido'); setCuenta(null); }
        else { setCuenta(invitacion.ledger_name); setError(''); }
      })
      .catch(() => { if (!cancelado) setError('No se pudo verificar el código'); })
      .finally(() => { if (!cancelado) setVerificando(false); });

    return () => { cancelado = true; };
  }, [codigo, usuario]);

  const unirse = async () => {
    if (!usuario) return;
    setUniendo(true);
    setError('');
    try {
      const res = await acceptInvite(db(usuario), codigo);
      if (!res.ok) { setError(res.error); return; }

      setListo(true);
      // Se recargan las cuentas para que el selector traiga la nueva.
      await refreshLedgers();
      setTimeout(() => router.replace('/'), 1500);
    } catch {
      setError('No se pudo unir a la cuenta');
    } finally {
      setUniendo(false);
    }
  };

  if (listo) {
    return (
      <Pantalla className="min-h-[60vh] items-center justify-center px-4">
        <View className="items-center gap-4">
          <View className="w-16 h-16 bg-emerald-500 rounded-full items-center justify-center">
            <Check size={32} color="#ffffff" />
          </View>
          <View className="items-center">
            <Texto className="text-white font-semibold text-lg">¡Listo!</Texto>
            <Texto className="text-slate-400 text-sm mt-1">Ya tenés acceso a {cuenta}</Texto>
          </View>
          <Loader2 size={16} color="#64748b" />
        </View>
      </Pantalla>
    );
  }

  return (
    <Pantalla className="min-h-[60vh] items-center justify-center px-4" keyboardShouldPersistTaps="handled">
      <View className="w-full gap-6" style={{ maxWidth: 384 }}>
        <View className="items-center gap-3">
          <View className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl items-center justify-center">
            <Users size={28} color="#34d399" />
          </View>
          <View className="items-center">
            <Texto className="text-xl font-bold text-white">Unirse a una cuenta</Texto>
            <Texto className="text-slate-400 text-sm mt-1 text-center">
              Poné el código de 6 caracteres que te compartieron
            </Texto>
          </View>
        </View>

        <View className="gap-3">
          <TextInput
            value={codigo}
            onChangeText={t => setCodigo(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder="ABC123"
            placeholderTextColor="#475569"
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            // El `font-mono` de la web no se porta: el teléfono solo carga Inter.
            // El interletrado sí, que es lo que hace legible un código de seis.
            className="w-full bg-slate-900 border-2 border-slate-700 rounded-xl px-4 py-4 text-white text-center text-xl"
            style={{ letterSpacing: 4 }}
          />

          {verificando ? (
            <View className="flex-row items-center justify-center gap-2">
              <Loader2 size={14} color="#64748b" />
              <Texto className="text-slate-500 text-sm">Verificando...</Texto>
            </View>
          ) : null}

          {error ? (
            <View className="flex-row items-center justify-center gap-2">
              <AlertCircle size={16} color="#fb7185" />
              <Texto className="text-rose-400 text-sm">{error}</Texto>
            </View>
          ) : null}

          {cuenta && !error ? (
            <View className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 items-center">
              <Texto className="text-xs text-slate-400">Te invitaron a</Texto>
              <Texto className="text-emerald-300 font-semibold mt-0.5">{cuenta}</Texto>
            </View>
          ) : null}
        </View>

        <Pressable
          onPress={unirse}
          disabled={!cuenta || uniendo || Boolean(error)}
          style={!cuenta || uniendo || error ? { opacity: 0.4 } : undefined}
          className="w-full py-3 bg-emerald-600 active:bg-emerald-500 rounded-xl flex-row items-center justify-center gap-2"
        >
          {uniendo ? <Loader2 size={16} color="#ffffff" /> : null}
          <Texto className="text-white font-medium">
            {uniendo ? 'Uniéndose...' : 'Unirme a esta cuenta'}
          </Texto>
        </Pressable>
      </View>
    </Pantalla>
  );
}
