'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Send, CheckCircle2, AlertCircle, Loader2, RefreshCw, Link2, ExternalLink,
  Wrench, ChevronDown,
} from 'lucide-react';
import ChatLinkPanel, { ChatLinkRow } from '@/components/ChatLinkPanel';

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
  chats: ChatLinkRow[];
  avanzado?: Avanzado;
}

export default function TelegramPage() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [verAvanzado, setVerAvanzado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/telegram/status');
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
      const res = await fetch('/api/telegram/webhook-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion }),
      });
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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-tinta-2" />
      </div>
    );
  }

  const av = estado?.avanzado;
  const webhookOk = av?.webhook?.configurado === true;

  return (
    <div className="space-y-6">
      {/* Sin título propio: la pestaña de arriba ya dice Telegram. */}
      <p className="text-tinta-2 text-sm">
        El mismo asistente, en tu Telegram: anotá gastos escribiendo, dictando o
        fotografiando el recibo.
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

      {estado && !estado.listo && (
        <div className="flex items-start gap-2 text-aviso text-sm bg-aviso/10 border border-aviso/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            El asistente de Telegram está fuera de línea en este momento. Podés dejar tu chat
            vinculado igual; va a empezar a responder en cuanto vuelva.
          </span>
        </div>
      )}

      {/* Vincular el chat propio: para el usuario común, la pantalla entera */}
      <ChatLinkPanel
        channel="telegram"
        titulo="Conectá tu Telegram"
        chats={estado?.chats ?? []}
        formatearId={id => `Chat ${id}`}
        onCambio={cargar}
        instrucciones={
          <>
            Generá un código y mandáselo{' '}
            {estado?.bot
              ? <a href={`https://t.me/${estado.bot.username}`} target="_blank" rel="noopener noreferrer"
                   className="text-info hover:text-info inline-flex items-center gap-1">
                  a @{estado.bot.username} <ExternalLink className="w-3 h-3" />
                </a>
              : 'a tu bot'}
            {' '}por Telegram. Así ese chat queda atado a tu cuenta y nadie más puede anotar en tus finanzas.
          </>
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
            'Te aviso cuando un gasto te pase del tope de la categoría',
          ].map(t => (
            <li key={t} className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-acento flex-shrink-0 mt-0.5" />
              {t}
            </li>
          ))}
        </ul>
      </div>

      {/* ─── De acá para abajo, solo para quien administra el bot ────────────── */}
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
                Esto lo ves porque administrás el bot. El resto de los usuarios solo ve el paso de arriba.
              </p>

              {av.faltantes.length > 0 && (
                <div className="bg-aviso/10 border border-aviso/20 rounded-xl p-4 space-y-3">
                  <p className="text-aviso text-sm font-medium">Falta crear el bot</p>
                  <ol className="text-xs text-tinta-2 space-y-1.5 list-decimal list-inside">
                    <li>
                      Abrí{' '}
                      <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer"
                         className="text-info hover:text-info inline-flex items-center gap-1">
                        @BotFather <ExternalLink className="w-3 h-3" />
                      </a>{' '}
                      en Telegram y mandale <code className="text-tinta">/newbot</code>.
                    </li>
                    <li>Elegí un nombre y un usuario que termine en <code className="text-tinta">bot</code>.</li>
                    <li>Copiá el token que te devuelve y cargalo en Vercel.</li>
                  </ol>
                  <div className="bg-hundido rounded-lg p-3 text-xs font-mono text-tinta space-y-1">
                    {av.faltantes.map(v => <p key={v}>{v}</p>)}
                  </div>
                  <p className="text-xs text-tinta-2">
                    <code className="text-tinta">TELEGRAM_WEBHOOK_SECRET</code> es una cadena larga al azar
                    que inventás vos: es lo que impide que cualquiera le postee al webhook.
                  </p>
                </div>
              )}

              <div className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-hundido rounded-lg flex items-center justify-center flex-shrink-0">
                    <Send className="w-5 h-5 text-tinta-2" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-tinta truncate">
                      {estado?.bot ? `@${estado.bot.username}` : 'Bot sin configurar'}
                    </p>
                    <p className={`text-xs ${webhookOk ? 'text-acento' : 'text-aviso'}`}>
                      {webhookOk ? 'Recibiendo mensajes' : 'El webhook todavía no está registrado'}
                    </p>
                  </div>
                  <button
                    onClick={cargar}
                    className="p-2 text-tinta-2 hover:text-tinta hover:bg-hundido rounded-lg transition-colors"
                    title="Actualizar estado"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {av.botError && <p className="text-xs text-peligro break-words">{av.botError}</p>}
                {av.webhook?.ultimoError && (
                  <p className="text-xs text-peligro break-words">
                    Último error de entrega: {av.webhook.ultimoError}
                  </p>
                )}

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <dt className="text-tinta-2">Modelo</dt>
                  <dd className="text-tinta font-mono break-all">{av.modelo}</dd>
                  <dt className="text-tinta-2">Moneda</dt>
                  <dd className="text-tinta">{av.moneda}</dd>
                  <dt className="text-tinta-2">Zona horaria</dt>
                  <dd className="text-tinta">{av.zonaHoraria}</dd>
                  {av.webhook && av.webhook.pendientes > 0 && (
                    <>
                      <dt className="text-tinta-2">Sin procesar</dt>
                      <dd className="text-aviso">{av.webhook.pendientes} mensajes en cola</dd>
                    </>
                  )}
                </dl>

                {av.configurado && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => configurarWebhook('registrar')}
                      disabled={ocupado !== ''}
                      className="px-3 py-2 bg-primario hover:bg-primario/85 disabled:opacity-50 text-sobre-primario rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                    >
                      {ocupado === 'registrar' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                      {webhookOk ? 'Volver a registrar webhook' : 'Registrar webhook'}
                    </button>
                    {webhookOk && (
                      <button
                        onClick={() => configurarWebhook('borrar')}
                        disabled={ocupado !== ''}
                        className="px-3 py-2 bg-hundido hover:bg-peligro/85 disabled:opacity-50 text-tinta rounded-lg text-xs font-medium transition-colors"
                      >
                        Desactivar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
