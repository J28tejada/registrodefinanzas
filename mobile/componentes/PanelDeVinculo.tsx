import { useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check, ChevronDown, Copy, ExternalLink, KeyRound, Loader2, Unlink } from 'lucide-react-native';
import Texto from './Texto';
import Selector from './Selector';
import { useCuenta } from './ContextoDeCuenta';
import { llamarApi } from '../lib/api';
import { LEDGER_COLOR_MAP } from '@compartido/types';

export interface FilaDeChat {
  id: string;
  channel: 'whatsapp' | 'telegram';
  external_id: string;
  ledger_id: string | null;
  created_at: string;
}

/**
 * El gemelo de components/ChatLinkPanel.tsx.
 *
 * Generar el código y administrar las conversaciones vinculadas. Es igual para
 * los dos canales: lo único que cambia es cómo se lee el identificador y las
 * instrucciones de a dónde mandarlo.
 */
export default function PanelDeVinculo({
  channel, titulo = 'Autorizá tu chat', chats, formatearId, instrucciones, onCambio, enlaceBot,
}: {
  channel: 'whatsapp' | 'telegram';
  titulo?: string;
  chats: FilaDeChat[];
  formatearId: (externalId: string) => string;
  instrucciones: React.ReactNode;
  onCambio: () => void | Promise<void>;
  enlaceBot?: (codigo: string) => string;
}) {
  const { ledgers } = useCuenta();

  const [ledgerDestino, setLedgerDestino] = useState('');
  const [codigo, setCodigo] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState('');

  const cuentas = [
    { valor: '', etiqueta: 'Sin cuenta asignada' },
    ...ledgers.map(l => ({ valor: l.id, etiqueta: l.name, color: LEDGER_COLOR_MAP[l.color]?.main })),
  ];

  const generar = async () => {
    setGenerando(true);
    setError('');
    try {
      const res = await llamarApi('/api/chats/link-code', {
        method: 'POST',
        body: { ledger_id: ledgerDestino || null, channel },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo generar el código');
      setCodigo(data.code);
      setCopiado(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el código');
    } finally {
      setGenerando(false);
    }
  };

  const copiar = async () => {
    if (!codigo) return;
    await Clipboard.setStringAsync(codigo);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const desvincular = (id: string, etiqueta: string) => {
    Alert.alert(`¿Desvincular ${etiqueta}?`, 'Dejará de poder anotar movimientos.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desvincular', style: 'destructive',
        onPress: async () => {
          await llamarApi(`/api/chats/${id}`, { method: 'DELETE' });
          await onCambio();
        },
      },
    ]);
  };

  const cambiarCuenta = async (id: string, ledgerId: string) => {
    await llamarApi(`/api/chats/${id}`, { method: 'PATCH', body: { ledger_id: ledgerId || null } });
    await onCambio();
  };

  return (
    <>
      <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 gap-4">
        <View>
          <Texto className="font-semibold text-white text-sm">{titulo}</Texto>
          <View className="mt-0.5">{instrucciones}</View>
        </View>

        <View className="gap-2">
          <Texto className="text-xs text-slate-500 leading-6">Anotar en la cuenta</Texto>
          <Selector
            value={ledgerDestino}
            opciones={cuentas}
            onChange={setLedgerDestino}
            titulo="Anotar en la cuenta"
          />
        </View>

        <Pressable
          onPress={generar}
          disabled={generando}
          style={generando ? { opacity: 0.5 } : undefined}
          className="w-full py-3 bg-emerald-600 active:bg-emerald-500 rounded-xl flex-row items-center justify-center gap-2"
        >
          {generando ? <Loader2 size={16} color="#ffffff" /> : <KeyRound size={16} color="#ffffff" />}
          <Texto className="text-white text-sm font-medium">Generar código de vinculación</Texto>
        </Pressable>

        {error ? <Texto className="text-xs text-rose-400">{error}</Texto> : null}

        {codigo ? (
          <View className="bg-slate-800 rounded-xl p-4 gap-2">
            <Texto className="text-xs text-slate-400 text-center">Mandá este código al bot</Texto>
            <View className="flex-row items-center justify-center gap-2">
              {/* El `font-mono` de la web no se porta: el teléfono solo carga
                  Inter. El interletrado sí, que es lo que separa los dígitos. */}
              <Texto className="text-2xl font-bold text-emerald-400" style={{ letterSpacing: 4 }}>
                {codigo}
              </Texto>
              <Pressable onPress={copiar} accessibilityLabel="Copiar" className="p-2">
                {copiado ? <Check size={16} color="#34d399" /> : <Copy size={16} color="#94a3b8" />}
              </Pressable>
            </View>
            {enlaceBot ? (
              <Pressable
                onPress={() => Linking.openURL(enlaceBot(codigo))}
                className="w-full py-2.5 bg-emerald-600 active:bg-emerald-500 rounded-lg flex-row items-center justify-center gap-2"
              >
                <ExternalLink size={16} color="#ffffff" />
                <Texto className="text-white text-sm font-medium">Abrir el chat del bot con el código</Texto>
              </Pressable>
            ) : null}

            <Texto className="text-xs text-slate-500 text-center">Vence en 15 minutos y sirve una sola vez.</Texto>
            <View className="pt-2 border-t border-slate-700/60 gap-1">
              <Texto className="text-xs text-slate-400">
                <Texto className="text-xs text-slate-300 font-medium">Chat privado:</Texto> mandáselo al bot y tus
                gastos se anotan en la cuenta elegida.
              </Texto>
              <Texto className="text-xs text-slate-400">
                <Texto className="text-xs text-slate-300 font-medium">Grupo:</Texto> mandalo dentro del grupo y todos
                sus gastos van a esa cuenta. Cada integrante tiene que vincular además su chat privado,
                para que lo que anote quede a su nombre.
              </Texto>
            </View>
          </View>
        ) : null}
      </View>

      <View className="gap-2">
        <Texto className="text-sm font-medium text-slate-300">Chats autorizados</Texto>
        {chats.length === 0 ? (
          <Texto className="text-slate-500 text-sm text-center py-8 bg-slate-900 border border-slate-800 rounded-2xl">
            Todavía no hay ninguno.
          </Texto>
        ) : null}
        {chats.map(c => {
          const etiqueta = formatearId(c.external_id);
          return (
            <View key={c.id} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex-row items-center gap-3">
              <View className="flex-1">
                <Texto className="text-sm text-white font-medium" numberOfLines={1}>{etiqueta}</Texto>
                <View className="mt-1">
                  <Selector
                    value={c.ledger_id ?? ''}
                    opciones={cuentas}
                    onChange={v => cambiarCuenta(c.id, v)}
                    titulo="Anotar en la cuenta"
                  />
                </View>
              </View>
              <Pressable
                onPress={() => desvincular(c.id, etiqueta)}
                accessibilityLabel="Desvincular"
                className="p-2"
              >
                <Unlink size={16} color="#94a3b8" />
              </Pressable>
            </View>
          );
        })}
      </View>
    </>
  );
}

/** La flechita del desplegable, para las cabeceras plegables de los dos canales. */
export function Flecha({ abierta }: { abierta: boolean }) {
  return (
    <View style={abierta ? { transform: [{ rotate: '180deg' }] } : undefined}>
      <ChevronDown size={16} color="#94a3b8" />
    </View>
  );
}
