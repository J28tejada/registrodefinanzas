import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import {
  AlertCircle, CheckCircle2, Link2, Loader2, RefreshCw, Send, Wrench,
} from 'lucide-react-native';
import Texto from '../../componentes/Texto';
import PanelDeVinculo, { FilaDeChat, Flecha } from '../../componentes/PanelDeVinculo';
import { llamarApi } from '../../lib/api';

/** Lo técnico: solo llega si sos admin. */
interface Avanzado {
  configurado: boolean;
  faltantes: string[];
  botError: string | null;
  webhook: { configurado: boolean; url: string; pendientes: number; ultimoError: string | null } | null;
  webhookUrlEsperada: string | null;
  modelo: string;
  moneda: string;
  zonaHoraria: string;
}

interface Estado {
  esAdmin: boolean;
  /** El bot existe y está escuchando. Lo único que le importa al usuario. */
  listo: boolean;
  bot: { username: string; first_name: string } | null;
  chats: FilaDeChat[];
  avanzado?: Avanzado;
}

const COMO_SE_USA = [
  'Escribí "gasté 800 en el súper" y te lo confirmo antes de guardarlo',
  'Mandá una nota de voz: te muestro lo que escuché para que lo revises',
  'Fotografiá el recibo: queda adjunto al movimiento',
  'Preguntá "¿cuánto gasté este mes?" o "¿cómo voy con el presupuesto?"',
  'Te aviso cuando un gasto te pase del tope de la categoría',
];

/** El gemelo de app/chat/telegram/page.tsx. */
export default function Telegram() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [verAvanzado, setVerAvanzado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await llamarApi('/api/telegram/status');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo leer el estado');
      setEstado(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el estado');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const configurarWebhook = async (accion: 'registrar' | 'borrar') => {
    setOcupado(accion);
    setError('');
    setAviso('');
    try {
      const res = await llamarApi('/api/telegram/webhook-config', { method: 'POST', body: { accion } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Falló la acción');
      setAviso(accion === 'registrar'
        ? 'Webhook registrado. El bot ya recibe mensajes.'
        : 'Webhook borrado. El bot dejó de recibir mensajes.');
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falló la acción');
    } finally {
      setOcupado('');
    }
  };

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center">
        <Loader2 size={24} color="#94a3b8" />
      </View>
    );
  }

  const av = estado?.avanzado;
  const webhookOk = av?.webhook?.configurado === true;

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-6" keyboardShouldPersistTaps="handled">
      {/* Sin título propio: la pestaña de arriba ya dice Telegram. */}
      <Texto className="text-slate-400 text-sm">
        El mismo asistente, en tu Telegram: anotá gastos escribiendo, dictando o
        fotografiando el recibo.
      </Texto>

      {error ? (
        <View className="flex-row items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><AlertCircle size={16} color="#fb7185" /></View>
          <Texto className="text-rose-400 text-sm flex-1">{error}</Texto>
        </View>
      ) : null}
      {aviso ? (
        <View className="flex-row items-start gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><CheckCircle2 size={16} color="#34d399" /></View>
          <Texto className="text-emerald-400 text-sm flex-1">{aviso}</Texto>
        </View>
      ) : null}

      {estado && !estado.listo ? (
        <View className="flex-row items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><AlertCircle size={16} color="#fbbf24" /></View>
          <Texto className="text-amber-400 text-sm flex-1">
            El asistente de Telegram está fuera de línea en este momento. Podés dejar tu chat
            vinculado igual; va a empezar a responder en cuanto vuelva.
          </Texto>
        </View>
      ) : null}

      {/* Vincular el chat propio: para el usuario común, la pantalla entera */}
      <PanelDeVinculo
        channel="telegram"
        titulo="Conectá tu Telegram"
        chats={estado?.chats ?? []}
        formatearId={id => `Chat ${id}`}
        onCambio={cargar}
        instrucciones={
          <Texto className="text-xs text-slate-400">
            Generá un código y mandáselo{' '}
            {estado?.bot ? (
              <Texto
                className="text-xs text-sky-400"
                onPress={() => Linking.openURL(`https://t.me/${estado.bot!.username}`)}
              >
                a @{estado.bot.username}
              </Texto>
            ) : 'a tu bot'}
            {' '}por Telegram. Así ese chat queda atado a tu cuenta y nadie más puede anotar en tus finanzas.
          </Texto>
        }
      />

      {/* Cómo se usa */}
      <View className="bg-slate-900 border border-slate-800 rounded-2xl p-4 gap-3">
        <Texto className="font-semibold text-white text-sm">Cómo se usa</Texto>
        <View className="gap-2">
          {COMO_SE_USA.map(t => (
            <View key={t} className="flex-row items-start gap-2">
              <View className="mt-0.5"><CheckCircle2 size={16} color="#34d399" /></View>
              <Texto className="text-sm text-slate-400 flex-1">{t}</Texto>
            </View>
          ))}
        </View>
      </View>

      {/* ─── De acá para abajo, solo para quien administra el bot ────────────── */}
      {av ? (
        <View className="border border-slate-800 rounded-2xl overflow-hidden">
          <Pressable
            onPress={() => setVerAvanzado(v => !v)}
            className="w-full px-4 py-3 flex-row items-center gap-2 active:bg-slate-900"
          >
            <Wrench size={16} color="#94a3b8" />
            <Texto className="text-sm text-slate-400 flex-1">Conexión del asistente</Texto>
            {!estado?.listo ? <View className="w-2 h-2 rounded-full bg-rose-500" /> : null}
            <Flecha abierta={verAvanzado} />
          </Pressable>

          {verAvanzado ? (
            <View className="p-4 pt-0 gap-4">
              <Texto className="text-xs text-slate-500">
                Esto lo ves porque administrás el bot. El resto de los usuarios solo ve el paso de arriba.
              </Texto>

              {av.faltantes.length > 0 ? (
                <View className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 gap-3">
                  <Texto className="text-amber-400 text-sm font-medium">Falta crear el bot</Texto>
                  <View className="gap-1.5">
                    <Texto className="text-xs text-slate-400">
                      1. Abrí{' '}
                      <Texto
                        className="text-xs text-sky-400"
                        onPress={() => Linking.openURL('https://t.me/BotFather')}
                      >
                        @BotFather
                      </Texto>
                      {' '}en Telegram y mandale /newbot.
                    </Texto>
                    <Texto className="text-xs text-slate-400">
                      2. Elegí un nombre y un usuario que termine en bot.
                    </Texto>
                    <Texto className="text-xs text-slate-400">
                      3. Copiá el token que te devuelve y cargalo en Vercel.
                    </Texto>
                  </View>
                  <View className="bg-slate-800 rounded-lg p-3 gap-1">
                    {av.faltantes.map(v => <Texto key={v} className="text-xs text-slate-300">{v}</Texto>)}
                  </View>
                  <Texto className="text-xs text-slate-500">
                    TELEGRAM_WEBHOOK_SECRET es una cadena larga al azar que inventás vos: es lo que
                    impide que cualquiera le postee al webhook.
                  </Texto>
                </View>
              ) : null}

              <View className="bg-slate-900 border border-slate-800 rounded-xl p-4 gap-4">
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 bg-sky-500/10 rounded-xl items-center justify-center">
                    <Send size={20} color="#38bdf8" />
                  </View>
                  <View className="flex-1">
                    <Texto className="text-sm font-medium text-white" numberOfLines={1}>
                      {estado?.bot ? `@${estado.bot.username}` : 'Bot sin configurar'}
                    </Texto>
                    <Texto className={`text-xs ${webhookOk ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {webhookOk ? 'Recibiendo mensajes' : 'El webhook todavía no está registrado'}
                    </Texto>
                  </View>
                  <Pressable onPress={cargar} accessibilityLabel="Actualizar estado" className="p-2">
                    <RefreshCw size={16} color="#94a3b8" />
                  </Pressable>
                </View>

                {av.botError ? <Texto className="text-xs text-rose-400">{av.botError}</Texto> : null}
                {av.webhook?.ultimoError ? (
                  <Texto className="text-xs text-rose-400">
                    Último error de entrega: {av.webhook.ultimoError}
                  </Texto>
                ) : null}

                <View className="gap-2">
                  <Dato clave="Modelo"><Texto className="text-xs text-slate-300">{av.modelo}</Texto></Dato>
                  <Dato clave="Moneda"><Texto className="text-xs text-slate-300">{av.moneda}</Texto></Dato>
                  <Dato clave="Zona horaria"><Texto className="text-xs text-slate-300">{av.zonaHoraria}</Texto></Dato>
                  {av.webhook && av.webhook.pendientes > 0 ? (
                    <Dato clave="Sin procesar">
                      <Texto className="text-xs text-amber-400">{av.webhook.pendientes} mensajes en cola</Texto>
                    </Dato>
                  ) : null}
                </View>

                {av.configurado ? (
                  <View className="flex-row flex-wrap gap-2">
                    <Pressable
                      onPress={() => configurarWebhook('registrar')}
                      disabled={ocupado !== ''}
                      style={ocupado !== '' ? { opacity: 0.5 } : undefined}
                      className="px-3 py-2 bg-sky-600 active:bg-sky-500 rounded-lg flex-row items-center gap-1.5"
                    >
                      {ocupado === 'registrar'
                        ? <Loader2 size={14} color="#ffffff" />
                        : <Link2 size={14} color="#ffffff" />}
                      <Texto className="text-white text-xs font-medium">
                        {webhookOk ? 'Volver a registrar webhook' : 'Registrar webhook'}
                      </Texto>
                    </Pressable>
                    {webhookOk ? (
                      <Pressable
                        onPress={() => configurarWebhook('borrar')}
                        disabled={ocupado !== ''}
                        style={ocupado !== '' ? { opacity: 0.5 } : undefined}
                        className="px-3 py-2 bg-slate-800 active:bg-rose-600 rounded-lg"
                      >
                        <Texto className="text-slate-200 text-xs font-medium">Desactivar</Texto>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

/** Una fila de la ficha técnica: la clave a la izquierda y el valor a la derecha. */
function Dato({ clave, children }: { clave: string; children: React.ReactNode }) {
  return (
    <View className="flex-row gap-4">
      <Texto className="text-xs text-slate-500" style={{ width: 96 }}>{clave}</Texto>
      <View className="flex-1">{children}</View>
    </View>
  );
}
