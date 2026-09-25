'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import {
  MessageCircle, CheckCircle2, AlertCircle, Loader2, Unlink, RefreshCw,
  Smartphone, QrCode, Link2, Wrench, ChevronDown,
} from 'lucide-react';
import ChatLinkPanel, { ChatLinkRow } from '@/components/ChatLinkPanel';

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
  chats: ChatLinkRow[];
  avanzado?: Avanzado;
}

const ESTADO_TEXTO: Record<string, { texto: string; clase: string }> = {
  open: { texto: 'Conectado', clase: 'text-acento' },
  connecting: { texto: 'Conectando…', clase: 'text-aviso' },
  close: { texto: 'Desconectado — hay que re-vincular', clase: 'text-peligro' },
  error: { texto: 'No responde', clase: 'text-peligro' },
  'sin-configurar': { texto: 'Sin configurar', clase: 'text-tinta-2' },
};

export default function WhatsappPage() {
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
      const res = await fetch('/api/whatsapp/status');
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
      const res = await fetch('/api/whatsapp/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, numero }),
      });
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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-tinta-2" />
      </div>
    );
  }

  const av = estado?.avanzado;
  const conexion = ESTADO_TEXTO[av?.state ?? 'sin-configurar'] ?? { texto: av?.state ?? '—', clase: 'text-tinta-2' };

  return (
    <div className="space-y-6">
      {/* Sin título propio: la pestaña de arriba ya dice WhatsApp, y repetirlo
          dos renglones más abajo no agrega nada. */}
      <p className="text-tinta-2 text-sm">
        El mismo asistente, en tu WhatsApp: anotá gastos e ingresos escribiendo,
        dictando o fotografiando el recibo.
      </p>

      {error && (
        <div className="flex items-start gap-2 text-peligro text-sm bg-peligro/10 border border-peligro/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}
      {aviso && (
        <div className="flex items-start gap-2 text-acento text-sm bg-acento/10 border border-acento/20 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{aviso}</span>
        </div>
      )}

      {/* Si el bot no está en línea hay que decirlo, o el usuario manda el código
          a un chat mudo y cree que hizo algo mal. Sin explicar por qué: eso es
          asunto de quien administra. */}
      {estado && !estado.listo && (
        <div className="flex items-start gap-2 text-aviso text-sm bg-aviso/10 border border-aviso/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            El asistente está fuera de línea en este momento. Podés dejar tu chat vinculado igual;
            va a empezar a responder en cuanto vuelva.
          </span>
        </div>
      )}

      {/* Vincular el WhatsApp propio: para el usuario común, la pantalla entera */}
      <ChatLinkPanel
        channel="whatsapp"
        titulo="Conectá tu WhatsApp"
        chats={estado?.chats ?? []}
        formatearId={id => `+${id}`}
        onCambio={cargarEstado}
        instrucciones={<>Generá un código y mandáselo por WhatsApp al asistente. Así ese número queda atado a tu cuenta y nadie más puede anotar movimientos en tus finanzas.</>}
        enlaceBot={
          estado?.numeroBot
            ? codigo => `https://wa.me/${estado.numeroBot}?text=${encodeURIComponent(codigo)}`
            : undefined
        }
      />

      {/* Cómo se usa */}
      <div className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-4 sm:p-5 space-y-3">
        <p className="font-semibold text-tinta text-sm">Cómo se usa</p>
        <ul className="space-y-2 text-sm text-tinta-2">
          {[
            'Escribí "gasté 800 en el súper" y te lo confirmo antes de guardarlo',
            'Mandá una nota de voz: te muestro lo que escuché para que lo revises',
            'Fotografiá el recibo: queda adjunto al movimiento',
            'Preguntá "¿cuánto gasté este mes?" o "¿cómo voy con el presupuesto?"',
            'Te aviso ahí mismo cuando un gasto te pase del tope de la categoría',
          ].map(t => (
            <li key={t} className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-acento flex-shrink-0 mt-0.5" />
              {t}
            </li>
          ))}
        </ul>
      </div>

      {/* ─── De acá para abajo, solo para quien administra la conexión ───────── */}
      {av && (
        <div className="border border-linea rounded-2xl overflow-hidden">
          <button
            onClick={() => setVerAvanzado(v => !v)}
            className="w-full px-4 py-3 flex items-center gap-2 text-tinta-2 hover:text-tinta hover:bg-panel transition-colors"
          >
            <Wrench className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm flex-1 text-left">Conexión del asistente</span>
            {!estado?.listo && <span className="w-2 h-2 rounded-full bg-peligro flex-shrink-0" />}
            <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${verAvanzado ? 'rotate-180' : ''}`} />
          </button>

          {verAvanzado && (
            <div className="p-4 pt-0 space-y-4">
              <p className="text-xs text-tinta-2">
                Esto lo ves porque administrás la instancia. El resto de los usuarios solo ve
                el paso de arriba.
              </p>

              {av.faltantes.length > 0 && (
                <div className="bg-aviso/10 border border-aviso/20 rounded-xl p-4 space-y-2">
                  <p className="text-aviso text-sm font-medium">Faltan variables de entorno</p>
                  <div className="bg-hundido rounded-lg p-3 text-xs font-mono text-tinta space-y-1">
                    {av.faltantes.map(v => <p key={v}>{v}</p>)}
                  </div>
                  <p className="text-xs text-tinta-2">
                    Cargalas en Vercel (Settings → Environment Variables) y volvé a desplegar.
                    Los detalles están en <code className="text-tinta">docs/whatsapp.md</code>.
                  </p>
                </div>
              )}

              <div className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-hundido rounded-lg flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="w-5 h-5 text-tinta-2" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-tinta">Instancia {av.instancia ?? '—'}</p>
                    <p className={`text-xs ${conexion.clase}`}>{conexion.texto}</p>
                  </div>
                  <button
                    onClick={cargarEstado}
                    className="p-2 text-tinta-2 hover:text-tinta hover:bg-hundido rounded-lg transition-colors"
                    title="Actualizar estado"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {av.stateError && <p className="text-xs text-peligro break-words">{av.stateError}</p>}

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <dt className="text-tinta-2">Webhook</dt>
                  <dd className={av.webhookConfigurado ? 'text-acento' : 'text-aviso'}>
                    {av.webhookConfigurado === null ? 'no se pudo verificar'
                      : av.webhookConfigurado ? 'configurado' : 'sin configurar'}
                  </dd>
                  <dt className="text-tinta-2">Modelo</dt>
                  <dd className="text-tinta font-mono break-all">{av.modelo}</dd>
                  <dt className="text-tinta-2">Moneda</dt>
                  <dd className="text-tinta">{av.moneda}</dd>
                  <dt className="text-tinta-2">Zona horaria</dt>
                  <dd className="text-tinta">{av.zonaHoraria}</dd>
                  {av.webhookUrl && (
                    <>
                      <dt className="text-tinta-2">URL</dt>
                      <dd className="text-tinta-2 font-mono text-3xs break-all">{av.webhookUrl}</dd>
                    </>
                  )}
                </dl>

                {av.configurado && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => accionInstancia('crear')}
                      disabled={ocupado !== ''}
                      className="px-3 py-2 bg-hundido hover:bg-presionado disabled:opacity-50 text-tinta rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                    >
                      {ocupado === 'crear' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                      Crear instancia + webhook
                    </button>
                    <button
                      onClick={() => accionInstancia('webhook')}
                      disabled={ocupado !== ''}
                      className="px-3 py-2 bg-hundido hover:bg-presionado disabled:opacity-50 text-tinta rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                    >
                      {ocupado === 'webhook' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Reconfigurar webhook
                    </button>
                    {av.state === 'open' && (
                      <button
                        onClick={() => accionInstancia('salir')}
                        disabled={ocupado !== ''}
                        className="px-3 py-2 bg-hundido hover:bg-peligro/85 disabled:opacity-50 text-tinta rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        Cerrar sesión
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Emparejar el teléfono del bot con Evolution */}
              {av.configurado && av.state !== 'open' && (
                <div className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-4 space-y-4">
                  <div>
                    <p className="font-semibold text-tinta text-sm">Vincular el teléfono del asistente</p>
                    <p className="text-xs text-tinta-2 mt-0.5">
                      Si estás en el mismo teléfono no podés escanear tu propia pantalla: usá el código de emparejamiento.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <input
                      value={telefono}
                      onChange={e => setTelefono(e.target.value)}
                      placeholder="Número del bot con código de país"
                      inputMode="tel"
                      className="flex-1 min-w-0 bg-hundido border border-linea-fuerte rounded-lg px-3 py-2 text-sm text-tinta placeholder:text-tinta-3 focus:outline-none focus:border-tinta-3"
                    />
                    <button
                      onClick={() => accionInstancia('conectar', telefono)}
                      disabled={ocupado !== '' || telefono.replace(/\D/g, '').length < 10}
                      className="px-3 py-2 bg-primario hover:bg-primario/85 disabled:opacity-50 text-sobre-primario rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 flex-shrink-0"
                    >
                      {ocupado === 'conectar' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5" />}
                      Código
                    </button>
                  </div>

                  <button
                    onClick={() => accionInstancia('conectar')}
                    disabled={ocupado !== ''}
                    className="text-xs text-tinta-2 hover:text-tinta transition-colors flex items-center gap-1.5 text-left"
                  >
                    <QrCode className="w-3.5 h-3.5 flex-shrink-0" /> o generar un QR para escanear desde otro dispositivo
                  </button>

                  {pairingCode && (
                    <div className="bg-hundido rounded-xl p-4 text-center space-y-1">
                      <p className="text-xs text-tinta-2">Código de emparejamiento</p>
                      <p className="text-2xl font-mono font-semibold tracking-[0.3em] text-acento">{pairingCode}</p>
                      <p className="text-xs text-tinta-2">
                        WhatsApp → Dispositivos vinculados → Vincular con número de teléfono
                      </p>
                    </div>
                  )}

                  {qr && (
                    <div className="bg-panel rounded-xl p-3 flex justify-center">
                      <Image src={qr} alt="Código QR para vincular WhatsApp" width={256} height={256} unoptimized />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
