'use client';

import { useState, useEffect } from 'react';
import { Mail, CheckCircle, RefreshCw, Trash2, AlertCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

interface GmailStatus {
  connected: boolean;
  pendingCount: number;
  lastChecked: number | null;
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const gmailParam = searchParams.get('gmail');

  useEffect(() => {
    if (gmailParam === 'connected') {
      setFlashMessage({ type: 'success', text: 'Gmail conectado correctamente.' });
    } else if (gmailParam === 'error') {
      setFlashMessage({ type: 'error', text: 'Error al conectar Gmail. Intenta de nuevo.' });
    }
  }, [gmailParam]);

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/gmail');
      if (res.ok) {
        const data = await res.json() as GmailStatus;
        setStatus(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/gmail/sync', { method: 'POST' });
      const data = await res.json() as { processed?: number; added?: number; skipped?: boolean; error?: string };
      if (data.skipped) {
        setSyncMessage('Revisión reciente detectada. Espera unos minutos antes de revisar de nuevo.');
      } else if (data.error) {
        setSyncMessage(`Error: ${data.error}`);
      } else {
        setSyncMessage(`Revisión completada. ${data.processed} correos procesados, ${data.added} transacciones nuevas detectadas.`);
        window.dispatchEvent(new Event('finanzas:refresh'));
      }
      await fetchStatus();
    } catch {
      setSyncMessage('Error al revisar correos. Intenta de nuevo.');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('¿Desconectar Gmail? Se eliminarán las credenciales guardadas.')) return;
    setDisconnecting(true);
    try {
      await fetch('/api/gmail', { method: 'DELETE' });
      setStatus({ connected: false, pendingCount: 0, lastChecked: null });
      setFlashMessage({ type: 'success', text: 'Gmail desconectado correctamente.' });
    } catch {
      setFlashMessage({ type: 'error', text: 'Error al desconectar Gmail.' });
    } finally {
      setDisconnecting(false);
    }
  };

  const formatLastChecked = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Ajustes</h1>
        <p className="text-slate-400 text-sm">Configura las integraciones de tu cuenta</p>
      </div>

      {flashMessage && (
        <div className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm ${
          flashMessage.type === 'success'
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
        }`}>
          {flashMessage.type === 'success'
            ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {flashMessage.text}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Integraciones</h2>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-slate-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-white font-medium">Gmail</h3>
                {!loadingStatus && status?.connected && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                    <CheckCircle className="w-3 h-3" /> Conectado
                  </span>
                )}
                {!loadingStatus && status?.pendingCount && status.pendingCount > 0 ? (
                  <span className="inline-flex items-center text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-2 py-0.5">
                    {status.pendingCount} pendiente{status.pendingCount !== 1 ? 's' : ''}
                  </span>
                ) : null}
              </div>
              <p className="text-slate-400 text-sm mt-0.5">
                Detecta automáticamente transacciones en correos de notificación bancaria
              </p>
              {!loadingStatus && status?.connected && status.lastChecked && (
                <p className="text-slate-500 text-xs mt-1">
                  Última revisión: {formatLastChecked(status.lastChecked)}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800">
            {loadingStatus ? (
              <div className="h-9 w-36 bg-slate-800 rounded-lg animate-pulse" />
            ) : status?.connected ? (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Revisando...' : 'Revisar correos ahora'}
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {disconnecting ? 'Desconectando...' : 'Desconectar'}
                </button>
              </div>
            ) : (
              <a
                href="/api/gmail/connect"
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Mail className="w-4 h-4" />
                Conectar Gmail
              </a>
            )}

            {syncMessage && (
              <p className="mt-3 text-sm text-slate-400">{syncMessage}</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
