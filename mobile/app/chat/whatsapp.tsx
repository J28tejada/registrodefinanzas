import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, TextInput, View } from 'react-native';
import {
  AlertCircle, CheckCircle2, Link2, Loader2, MessageCircle, QrCode, RefreshCw,
  Smartphone, Unlink, Wrench,
} from 'lucide-react-native';
import Texto from '../../componentes/Texto';
import PanelDeVinculo, { FilaDeChat, Flecha } from '../../componentes/PanelDeVinculo';
import { llamarApi } from '../../lib/api';
import { useColores } from '../../lib/colores';

/** Lo técnico: solo llega si sos admin. */
interface Avanzado {
  configurado: boolean;
  faltantes: string[];
  instancia: string | null;
  state: string;
  stateError: string | null;
  webhookUrl: string | null;
  webhookConfigurado: boolean | null;
  modelo: string;
  moneda: string;
  zonaHoraria: string;
}

interface Estado {
  esAdmin: boolean;
  /** El bot está en línea y va a contestar. Lo único que le importa al usuario. */
  listo: boolean;
  /** El número emparejado. Null mientras la instancia no esté conectada. */
  numeroBot: string | null;
  chats: FilaDeChat[];
  avanzado?: Avanzado;
}

const ESTADO_TEXTO: Record<string, { texto: string; clase: string }> = {
  open: { texto: 'Conectado', clase: 'text-acento' },
  connecting: { texto: 'Conectando…', clase: 'text-aviso' },
  close: { texto: 'Desconectado — hay que re-vincular', clase: 'text-peligro' },
  error: { texto: 'No responde', clase: 'text-peligro' },
  'sin-configurar': { texto: 'Sin configurar', clase: 'text-tinta-2' },
};

const COMO_SE_USA = [
  'Escribí "gasté 800 en el súper" y te lo confirmo antes de guardarlo',
  'Mandá una nota de voz: te muestro lo que escuché para que lo revises',
  'Fotografiá el recibo: queda adjunto al movimiento',
  'Preguntá "¿cuánto gasté este mes?" o "¿cómo voy con el presupuesto?"',
  'Te aviso ahí mismo cuando un gasto te pase del tope de la categoría',
];

/** El gemelo de app/chat/whatsapp/page.tsx. */
export default function Whatsapp() {
  const paleta = useColores();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState('');

  const [telefono, setTelefono] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [verAvanzado, setVerAvanzado] = useState(false);

  const cargarEstado = useCallback(async () => {
    try {
      const res = await llamarApi('/api/whatsapp/status');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo leer el estado');
      setEstado(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el estado');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargarEstado(); }, [cargarEstado]);

  const accionInstancia = async (accion: string, numero?: string) => {
    setOcupado(accion);
    setError('');
    setAviso('');
    try {
      const res = await llamarApi('/api/whatsapp/instance', { method: 'POST', body: { accion, numero } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Falló la acción');

      if (accion === 'conectar') {
        setQr(data.qr ?? null);
        setPairingCode(data.pairingCode ?? null);
        if (!data.qr && !data.pairingCode) {
          setAviso('Evolution no devolvió ni QR ni código: puede que la instancia ya esté conectada.');
        }
      }
      if (accion === 'crear') {
        setAviso(data.yaExistia
          ? 'La instancia ya existía; el webhook quedó reconfigurado.'
          : 'Instancia creada y webhook configurado.');
      }
      if (accion === 'webhook') setAviso('Webhook reconfigurado con webhookByEvents en false.');
      if (accion === 'salir') { setQr(null); setPairingCode(null); setAviso('Sesión cerrada.'); }

      await cargarEstado();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falló la acción');
    } finally {
      setOcupado('');
    }
  };

  if (cargando) {
    return (
      <View className="flex-1 items-center justify-center">
        <Loader2 size={24} color={paleta.tinta2} />
      </View>
    );
  }

  const av = estado?.avanzado;
  const conexion = ESTADO_TEXTO[av?.state ?? 'sin-configurar']
    ?? { texto: av?.state ?? '—', clase: 'text-tinta-2' };

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-6" keyboardShouldPersistTaps="handled">
      {/* Sin título propio: la pestaña de arriba ya dice WhatsApp, y repetirlo
          dos renglones más abajo no agrega nada. */}
      <Texto className="text-tinta-2 text-sm">
        El mismo asistente, en tu WhatsApp: anotá gastos e ingresos escribiendo,
        dictando o fotografiando el recibo.
      </Texto>

      {error ? (
        <View className="flex-row items-start gap-2 bg-peligro/10 border border-peligro/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><AlertCircle size={16} color={paleta.peligro} /></View>
          <Texto className="text-peligro text-sm flex-1">{error}</Texto>
        </View>
      ) : null}
      {aviso ? (
        <View className="flex-row items-start gap-2 bg-acento/10 border border-acento/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><CheckCircle2 size={16} color={paleta.acento} /></View>
          <Texto className="text-acento text-sm flex-1">{aviso}</Texto>
        </View>
      ) : null}

      {/* Si el bot no está en línea hay que decirlo, o el usuario manda el código
          a un chat mudo y cree que hizo algo mal. Sin explicar por qué: eso es
          asunto de quien administra. */}
      {estado && !estado.listo ? (
        <View className="flex-row items-start gap-2 bg-aviso/10 border border-aviso/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><AlertCircle size={16} color={paleta.aviso} /></View>
          <Texto className="text-aviso text-sm flex-1">
            El asistente está fuera de línea en este momento. Podés dejar tu chat vinculado igual;
            va a empezar a responder en cuanto vuelva.
          </Texto>
        </View>
      ) : null}

      {/* Vincular el WhatsApp propio: para el usuario común, la pantalla entera */}
      <PanelDeVinculo
        channel="whatsapp"
        titulo="Conectá tu WhatsApp"
        chats={estado?.chats ?? []}
        formatearId={id => `+${id}`}
        onCambio={cargarEstado}
        instrucciones={
          <Texto className="text-xs text-tinta-2">
            Generá un código y mandáselo por WhatsApp al asistente. Así ese número queda atado a tu
            cuenta y nadie más puede anotar movimientos en tus finanzas.
          </Texto>
        }
        enlaceBot={
          estado?.numeroBot
            ? codigo => `https://wa.me/${estado.numeroBot}?text=${encodeURIComponent(codigo)}`
            : undefined
        }
      />

      {/* Cómo se usa */}
      <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-4 gap-3">
        <Texto className="font-semibold text-tinta text-sm">Cómo se usa</Texto>
        <View className="gap-2">
          {COMO_SE_USA.map(t => (
            <View key={t} className="flex-row items-start gap-2">
              <View className="mt-0.5"><CheckCircle2 size={16} color={paleta.acento} /></View>
              <Texto className="text-sm text-tinta-2 flex-1">{t}</Texto>
            </View>
          ))}
        </View>
      </View>

      {/* ─── De acá para abajo, solo para quien administra la conexión ───────── */}
      {av ? (
        <View className="border border-linea rounded-2xl overflow-hidden">
          <Pressable
            onPress={() => setVerAvanzado(v => !v)}
            className="w-full px-4 py-3 flex-row items-center gap-2 active:bg-panel"
          >
            <Wrench size={16} color={paleta.tinta2} />
            <Texto className="text-sm text-tinta-2 flex-1">Conexión del asistente</Texto>
            {!estado?.listo ? <View className="w-2 h-2 rounded-full bg-peligro" /> : null}
            <Flecha abierta={verAvanzado} />
          </Pressable>

          {verAvanzado ? (
            <View className="p-4 pt-0 gap-4">
              <Texto className="text-xs text-tinta-2">
                Esto lo ves porque administrás la instancia. El resto de los usuarios solo ve
                el paso de arriba.
              </Texto>

              {av.faltantes.length > 0 ? (
                <View className="bg-aviso/10 border border-aviso/20 rounded-xl p-4 gap-2">
                  <Texto className="text-aviso text-sm font-medium">Faltan variables de entorno</Texto>
                  <View className="bg-hundido rounded-lg p-3 gap-1">
                    {av.faltantes.map(v => <Texto key={v} className="text-xs text-tinta">{v}</Texto>)}
                  </View>
                  <Texto className="text-xs text-tinta-2">
                    Cargalas en Vercel (Settings → Environment Variables) y volvé a desplegar.
                    Los detalles están en docs/whatsapp.md.
                  </Texto>
                </View>
              ) : null}

              <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-4 gap-4">
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 bg-hundido rounded-lg items-center justify-center">
                    <MessageCircle size={20} color={paleta.tinta2} />
                  </View>
                  <View className="flex-1">
                    <Texto className="text-sm font-medium text-tinta">Instancia {av.instancia ?? '—'}</Texto>
                    <Texto className={`text-xs ${conexion.clase}`}>{conexion.texto}</Texto>
                  </View>
                  <Pressable onPress={cargarEstado} accessibilityLabel="Actualizar estado" className="p-2">
                    <RefreshCw size={16} color={paleta.tinta2} />
                  </Pressable>
                </View>

                {av.stateError ? <Texto className="text-xs text-peligro">{av.stateError}</Texto> : null}

                <View className="gap-2">
                  <Dato clave="Webhook">
                    <Texto className={`text-xs ${av.webhookConfigurado ? 'text-acento' : 'text-aviso'}`}>
                      {av.webhookConfigurado === null ? 'no se pudo verificar'
                        : av.webhookConfigurado ? 'configurado' : 'sin configurar'}
                    </Texto>
                  </Dato>
                  <Dato clave="Modelo"><Texto className="text-xs text-tinta">{av.modelo}</Texto></Dato>
                  <Dato clave="Moneda"><Texto className="text-xs text-tinta">{av.moneda}</Texto></Dato>
                  <Dato clave="Zona horaria"><Texto className="text-xs text-tinta">{av.zonaHoraria}</Texto></Dato>
                  {av.webhookUrl ? (
                    <Dato clave="URL"><Texto className="text-3xs text-tinta-2">{av.webhookUrl}</Texto></Dato>
                  ) : null}
                </View>

                {av.configurado ? (
                  <View className="flex-row flex-wrap gap-2">
                    <Accion
                      onPress={() => accionInstancia('crear')}
                      ocupado={ocupado !== ''}
                      cargando={ocupado === 'crear'}
                      icono={<Link2 size={14} color={paleta.tinta} />}
                      texto="Crear instancia + webhook"
                    />
                    <Accion
                      onPress={() => accionInstancia('webhook')}
                      ocupado={ocupado !== ''}
                      cargando={ocupado === 'webhook'}
                      icono={<RefreshCw size={14} color={paleta.tinta} />}
                      texto="Reconfigurar webhook"
                    />
                    {av.state === 'open' ? (
                      <Accion
                        onPress={() => accionInstancia('salir')}
                        ocupado={ocupado !== ''}
                        cargando={false}
                        icono={<Unlink size={14} color={paleta.tinta} />}
                        texto="Cerrar sesión"
                        peligrosa
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>

              {/* Emparejar el teléfono del bot con Evolution */}
              {av.configurado && av.state !== 'open' ? (
                <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-4 gap-4">
                  <View>
                    <Texto className="font-semibold text-tinta text-sm">Vincular el teléfono del asistente</Texto>
                    <Texto className="text-xs text-tinta-2 mt-0.5">
                      Si estás en el mismo teléfono no podés escanear tu propia pantalla: usá el código de emparejamiento.
                    </Texto>
                  </View>

                  <View className="flex-row gap-2">
                    <TextInput
                      value={telefono}
                      onChangeText={setTelefono}
                      placeholder="Número del bot con código de país"
                      placeholderTextColor={paleta.tinta2}
                      keyboardType="phone-pad"
                      className="flex-1 bg-hundido border border-linea-fuerte rounded-lg px-3 py-2 text-sm text-tinta"
                    />
                    <Pressable
                      onPress={() => accionInstancia('conectar', telefono)}
                      disabled={ocupado !== '' || telefono.replace(/\D/g, '').length < 10}
                      style={ocupado !== '' || telefono.replace(/\D/g, '').length < 10
                        ? { opacity: 0.5 } : undefined}
                      className="px-3 py-2 bg-primario active:bg-primario/85 rounded-lg flex-row items-center gap-1.5"
                    >
                      {ocupado === 'conectar'
                        ? <Loader2 size={14} color={paleta.sobrePrimario} />
                        : <Smartphone size={14} color={paleta.sobrePrimario} />}
                      <Texto className="text-sobre-primario text-xs font-medium">Código</Texto>
                    </Pressable>
                  </View>

                  <Pressable
                    onPress={() => accionInstancia('conectar')}
                    disabled={ocupado !== ''}
                    className="flex-row items-center gap-1.5"
                  >
                    <QrCode size={14} color={paleta.tinta2} />
                    <Texto className="text-xs text-tinta-2 flex-1">
                      o generar un QR para escanear desde otro dispositivo
                    </Texto>
                  </Pressable>

                  {pairingCode ? (
                    <View className="bg-hundido rounded-xl p-4 items-center gap-1">
                      <Texto className="text-xs text-tinta-2">Código de emparejamiento</Texto>
                      <Texto className="text-2xl font-semibold text-acento" style={{ letterSpacing: 6 }}>
                        {pairingCode}
                      </Texto>
                      <Texto className="text-xs text-tinta-2 text-center">
                        WhatsApp → Dispositivos vinculados → Vincular con número de teléfono
                      </Texto>
                    </View>
                  ) : null}

                  {qr ? (
                    <View className="bg-panel rounded-xl p-3 items-center">
                      <Image
                        source={{ uri: qr }}
                        style={{ width: 256, height: 256 }}
                        accessibilityLabel="Código QR para vincular WhatsApp"
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}
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
      <Texto className="text-xs text-tinta-2" style={{ width: 96 }}>{clave}</Texto>
      <View className="flex-1">{children}</View>
    </View>
  );
}

function Accion({
  onPress, ocupado, cargando, icono, texto, peligrosa,
}: {
  onPress: () => void;
  ocupado: boolean;
  cargando: boolean;
  icono: React.ReactNode;
  texto: string;
  peligrosa?: boolean;
}) {
  const paleta = useColores();
  return (
    <Pressable
      onPress={onPress}
      disabled={ocupado}
      style={ocupado ? { opacity: 0.5 } : undefined}
      className={`px-3 py-2 bg-hundido rounded-lg flex-row items-center gap-1.5 ${
        peligrosa ? 'active:bg-peligro/85' : 'active:bg-presionado'
      }`}
    >
      {cargando ? <Loader2 size={14} color={paleta.tinta} /> : icono}
      <Texto className="text-tinta text-xs font-medium">{texto}</Texto>
    </Pressable>
  );
}
