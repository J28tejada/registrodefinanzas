import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  AlertCircle, Check, Copy, Crown, Loader2, LogOut, UserPlus, Users, X,
} from 'lucide-react-native';
import Texto from './Texto';
import { useSesion } from './ContextoDeSesion';
import { db } from '../lib/datos';
import { BASE } from '../lib/api';
import { createInvite, getLedgerMembers, removeLedgerMember } from '@compartido/db';
import { LedgerMember, LedgerWithStats } from '@compartido/types';

/**
 * El gemelo de components/LedgerMembers.tsx.
 *
 * Quién tiene acceso a una cuenta, y cómo invitar a alguien más.
 */
export default function MiembrosDeCuenta({
  ledger, onBack, onChanged,
}: {
  ledger: LedgerWithStats;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { session } = useSesion();
  // Para distinguir mi propia fila: ahí va "salir", no "quitar".
  const miId = session?.user?.id ?? '';

  const [miembros, setMiembros] = useState<LedgerMember[]>([]);
  const [cargando, setCargando] = useState(true);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState('');

  const esDueno = ledger.role === 'owner';

  const cargar = useCallback(async () => {
    if (!miId) return;
    setCargando(true);
    try {
      setMiembros(await getLedgerMembers(db(miId), ledger.id));
    } catch {
      setError('No se pudieron cargar los miembros');
    } finally {
      setCargando(false);
    }
  }, [miId, ledger.id]);

  useEffect(() => { cargar(); }, [cargar]);

  const generar = async () => {
    setGenerando(true);
    setError('');
    try {
      const res = await createInvite(db(miId), ledger.id);
      if ('error' in res) { setError(res.error); return; }
      setCodigo(res.code);
      setCopiado(false);
    } catch {
      setError('No se pudo crear la invitación');
    } finally {
      setGenerando(false);
    }
  };

  /*
   * El enlace apunta a la app WEB, no a la app.
   *
   * En la web sale de `window.location.origin`, que acá no existe. Y aunque
   * existiera no serviría: quien recibe el mensaje casi nunca tiene la app
   * instalada, así que un enlace que solo abre la app lo dejaría sin nada que
   * tocar. La web abre en cualquier teléfono y desde ahí se entra igual.
   *
   * Sin `EXPO_PUBLIC_API_URL` no hay a dónde apuntar y se comparte el código
   * pelado, que es lo mismo tipeado a mano.
   */
  const enlace = codigo ? (BASE ? `${BASE}/unirse?codigo=${codigo}` : codigo) : '';

  const copiar = async () => {
    await Clipboard.setStringAsync(enlace);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const quitar = (userId: string, soyYo: boolean) => {
    Alert.alert(
      soyYo ? `¿Salir de "${ledger.name}"?` : '¿Quitar a esta persona de la cuenta?',
      soyYo ? 'Vas a perder acceso a sus movimientos.' : undefined,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: soyYo ? 'Salir' : 'Quitar', style: 'destructive',
          onPress: async () => {
            setError('');
            const res = await removeLedgerMember(db(miId), ledger.id, userId);
            if (!res.ok) { setError(res.error ?? 'No se pudo quitar'); return; }
            onChanged();
            if (soyYo) onBack();
            else cargar();
          },
        },
      ],
    );
  };

  return (
    <View className="gap-5">
      <View className="flex-row items-center gap-2">
        <Users size={16} color="#94a3b8" />
        <Texto className="text-sm font-medium text-white">Personas con acceso</Texto>
      </View>

      {error ? (
        <View className="flex-row items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          <View className="mt-0.5"><AlertCircle size={16} color="#fb7185" /></View>
          <Texto className="text-rose-400 text-sm flex-1">{error}</Texto>
        </View>
      ) : null}

      {cargando ? (
        <View className="gap-2">
          {[0, 1].map(i => <View key={i} className="h-14 bg-slate-800 rounded-xl" />)}
        </View>
      ) : (
        <View className="gap-2">
          {miembros.map(m => {
            const soyYo = m.user_id === miId;
            const puedeQuitar = m.role !== 'owner' && (esDueno || soyYo);
            return (
              <View key={m.user_id} className="flex-row items-center gap-3 bg-slate-800 rounded-xl px-3 py-2.5">
                {m.avatar_url ? (
                  <Image source={{ uri: m.avatar_url }} className="w-8 h-8 rounded-full" />
                ) : (
                  <View className="w-8 h-8 rounded-full bg-slate-700 items-center justify-center">
                    <Texto className="text-sm text-slate-300">{m.name.charAt(0).toUpperCase()}</Texto>
                  </View>
                )}
                <View className="flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <Texto className="text-sm text-white" numberOfLines={1}>{m.name}</Texto>
                    {soyYo ? <Texto className="text-xs text-slate-500">(vos)</Texto> : null}
                    {m.role === 'owner' ? <Crown size={12} color="#fbbf24" /> : null}
                  </View>
                  <Texto className="text-xs text-slate-500" numberOfLines={1}>{m.email}</Texto>
                </View>
                {puedeQuitar ? (
                  <Pressable
                    onPress={() => quitar(m.user_id, soyYo)}
                    accessibilityLabel={soyYo ? 'Salir de la cuenta' : 'Quitar de la cuenta'}
                    className="p-1.5"
                  >
                    {soyYo ? <LogOut size={14} color="#64748b" /> : <X size={14} color="#64748b" />}
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {esDueno ? (
        <View className="gap-3 pt-1">
          {!codigo ? (
            <Pressable
              onPress={generar}
              disabled={generando}
              style={generando ? { opacity: 0.5 } : undefined}
              className="w-full flex-row items-center justify-center gap-2 py-2.5 bg-emerald-600 active:bg-emerald-500 rounded-xl"
            >
              {generando ? <Loader2 size={16} color="#ffffff" /> : <UserPlus size={16} color="#ffffff" />}
              <Texto className="text-white text-sm font-medium">
                {generando ? 'Generando...' : 'Invitar a alguien'}
              </Texto>
            </Pressable>
          ) : (
            <View className="gap-3 bg-slate-800 border border-slate-700 rounded-xl p-4">
              <View className="items-center">
                <Texto className="text-xs text-slate-400">Código de invitación</Texto>
                {/* El `font-mono` de la web no se porta: el teléfono solo carga
                    Inter. El interletrado sí, que es lo que separa los dígitos. */}
                <Texto className="text-xl text-emerald-300 mt-1" style={{ letterSpacing: 4 }}>
                  {codigo}
                </Texto>
                <Texto className="text-xs text-slate-500 mt-1.5">Vence en 7 días</Texto>
              </View>

              <Pressable
                onPress={copiar}
                className="w-full flex-row items-center justify-center gap-2 py-2.5 bg-slate-700 active:bg-slate-600 rounded-lg"
              >
                {copiado ? <Check size={16} color="#34d399" /> : <Copy size={16} color="#ffffff" />}
                <Texto className="text-white text-sm">
                  {copiado
                    ? '¡Enlace copiado!'
                    : BASE ? 'Copiar enlace para compartir' : 'Copiar el código'}
                </Texto>
              </Pressable>

              <Texto className="text-xs text-slate-500 text-center leading-relaxed">
                Mandáselo por WhatsApp. Quien lo abra y entre con su cuenta
                va a poder ver y cargar movimientos acá.
              </Texto>

              <Pressable onPress={generar}>
                <Texto className="text-xs text-slate-400 text-center">
                  Generar otro código (anula el anterior)
                </Texto>
              </Pressable>
            </View>
          )}
        </View>
      ) : (
        <Texto className="text-xs text-slate-500 text-center">
          Solo el dueño de la cuenta puede invitar a más personas.
        </Texto>
      )}

      <Pressable
        onPress={onBack}
        className="w-full py-2.5 bg-slate-800 active:bg-slate-700 rounded-lg items-center"
      >
        <Texto className="text-slate-300 text-sm">Volver</Texto>
      </Pressable>
    </View>
  );
}
