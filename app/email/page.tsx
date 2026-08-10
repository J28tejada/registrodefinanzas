'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Mail, RefreshCw, CheckCircle2, AlertCircle, Loader2,
  Unlink, Download, ChevronDown, ExternalLink,
} from 'lucide-react';
import { useLedger } from '@/components/LedgerContext';
import { useFormatters } from '@/components/SettingsContext';
import { EmailTransaction, LEDGER_COLOR_MAP } from '@/lib/types';

interface ImportRow extends EmailTransaction {
  selected: boolean;
  ledger_id: string;
  date_override: string;
}

export default function EmailPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto pt-14 md:pt-0 flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>}>
      <EmailPageInner />
    </Suspense>
  );
}

function EmailPageInner() {
  const searchParams = useSearchParams();
  const { ledgers, refreshLedgers } = useLedger();
  const fmt = useFormatters();

  const [connected, setConnected] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState('');
  const [configMissing, setConfigMissing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [scannedCount, setScannedCount] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: number; fail: number } | null>(null);
  const [error, setError] = useState('');
  const [statusLoaded, setStatusLoaded] = useState(false);

  const defaultLedgerId = ledgers[0]?.id ?? '';

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/email/status');
      const data = await res.json();
      setConnected(data.connected);
      setConnectedEmail(data.email ?? '');
    } catch {
      setConnected(false);
    } finally {
      setStatusLoaded(true);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Handle OAuth redirect result
  useEffect(() => {
    if (!statusLoaded) return;
    const err = searchParams.get('error');
    const ok = searchParams.get('connected');
    if (err === 'access_denied') setError('Acceso denegado. Intenta de nuevo.');
    if (err === 'auth_failed') setError('Error al autenticar con Google. Verifica la configuración.');
    if (ok === '1') { loadStatus(); }
  }, [statusLoaded, searchParams, loadStatus]);

  const handleConnect = async () => {
    setError('');
    // Check if configured first
    const res = await fetch('/api/email/connect', { redirect: 'manual' });
    if (res.status === 503) {
      const data = await res.json();
      setError(data.error);
      setConfigMissing(true);
      return;
    }
    // Follow the redirect to Google OAuth
    window.location.href = '/api/email/connect';
  };

  const handleDisconnect = async () => {
    if (!confirm('¿Desconectar la cuenta de correo?')) return;
    await fetch('/api/email/disconnect', { method: 'POST' });
    setConnected(false);
    setConnectedEmail('');
    setRows([]);
    setScannedCount(null);
  };

  const handleScan = async () => {
    setScanning(true);
    setError('');
    setRows([]);
    setScannedCount(null);
    setImportResult(null);
    try {
      const res = await fetch('/api/email/scan');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al escanear');
      setScannedCount(data.total_scanned);
      setRows(
        (data.transactions as EmailTransaction[]).map(t => ({
          ...t,
          selected: true,
          ledger_id: defaultLedgerId,
          date_override: fmt.today(),
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al escanear correos');
    } finally {
      setScanning(false);
    }
  };

  const handleImport = async () => {
    const toImport = rows.filter(r => r.selected && r.amount && r.type && r.description);
    if (toImport.length === 0) return;

    setImporting(true);
    setError('');
    let ok = 0, fail = 0;

    const ledger = ledgers.find(l => l.id === toImport[0].ledger_id);
    const scope = ledger?.type ?? 'personal';

    for (const row of toImport) {
      try {
        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ledger_id: row.ledger_id || null,
            type: row.type,
            scope,
            amount: row.amount,
            category: row.category ?? 'Otros',
            description: row.description,
            date: row.date_override,
            source: 'ai',
          }),
        });
        if (res.ok) { ok++; } else { fail++; }
      } catch { fail++; }
    }

    await refreshLedgers();
    setImportResult({ ok, fail });
    setRows(prev => prev.map(r => r.selected ? { ...r, selected: false } : r));
    setImporting(false);
  };

  const selectedCount = rows.filter(r => r.selected).length;

  if (!statusLoaded) {
    return (
      <div className="max-w-2xl mx-auto pt-14 md:pt-0 flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-14 md:pt-0">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">Correo electrónico</h1>
        <p className="text-slate-400 text-sm">Importa transacciones desde correos bancarios</p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Not connected */}
      {!connected && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center">
              <Mail className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="font-semibold text-white">Conectar Gmail</p>
              <p className="text-sm text-slate-400">
                Escanea tus correos bancarios y extrae gastos automáticamente con IA
              </p>
            </div>
          </div>

          <ul className="space-y-2 text-sm text-slate-400">
            {[
              'Detecta correos de tu banco automáticamente',
              'La IA extrae monto, descripción y categoría',
              'Tú decides qué importar antes de guardar',
              'Solo lectura — no se envía ni modifica nada',
            ].map(item => (
              <li key={item} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>

          {configMissing ? (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-2">
              <p className="text-amber-400 text-sm font-medium">Configuración requerida</p>
              <p className="text-slate-400 text-xs">
                Para conectar Gmail necesitas crear credenciales OAuth en Google Cloud Console y
                agregarlas como variables de entorno en Vercel.
              </p>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Ir a Google Cloud Console <ExternalLink className="w-3 h-3" />
              </a>
              <div className="mt-2 bg-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 space-y-1">
                <p>GOOGLE_CLIENT_ID=...</p>
                <p>GOOGLE_CLIENT_SECRET=...</p>
                <p>NEXT_PUBLIC_APP_URL=https://registrodefinanzas.vercel.app</p>
              </div>
              <p className="text-xs text-slate-500">
                URI de redirección autorizado:{' '}
                <code className="text-slate-300">
                  {process.env.NEXT_PUBLIC_APP_URL ?? 'https://TU_DOMINIO'}/api/email/callback
                </code>
              </p>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Mail className="w-4 h-4" />
              Conectar con Gmail
            </button>
          )}
        </div>
      )}

      {/* Connected */}
      {connected && (
        <>
          {/* Account card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
              <Mail className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{connectedEmail}</p>
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Conectado
              </p>
            </div>
            <button
              onClick={handleDisconnect}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
              title="Desconectar"
            >
              <Unlink className="w-4 h-4" />
            </button>
          </div>

          {/* Scan button */}
          <button
            onClick={handleScan}
            disabled={scanning}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {scanning ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Escaneando correos...</>
            ) : (
              <><RefreshCw className="w-4 h-4" /> Escanear últimos 30 días</>
            )}
          </button>

          {/* Import result */}
          {importResult && (
            <div className="flex items-center gap-2 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-emerald-400">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              {importResult.ok} transacciones importadas
              {importResult.fail > 0 && ` · ${importResult.fail} fallaron`}
            </div>
          )}

          {/* Scan result */}
          {scannedCount !== null && rows.length === 0 && !scanning && (
            <div className="text-center py-10 text-slate-500">
              <Mail className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No se encontraron correos de transacciones</p>
              <p className="text-xs mt-1">Se escanearon {scannedCount} correos bancarios</p>
            </div>
          )}

          {/* Detected transactions */}
          {rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-300">
                  {rows.length} transacciones detectadas
                  {scannedCount !== null && (
                    <span className="text-slate-500 font-normal"> · de {scannedCount} correos</span>
                  )}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRows(r => r.map(x => ({ ...x, selected: true })))}
                    className="text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    Seleccionar todo
                  </button>
                  <span className="text-slate-700">·</span>
                  <button
                    onClick={() => setRows(r => r.map(x => ({ ...x, selected: false })))}
                    className="text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    Ninguno
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {rows.map((row, i) => {
                  const ledger = ledgers.find(l => l.id === row.ledger_id);
                  const lColor = ledger ? LEDGER_COLOR_MAP[ledger.color] : null;
                  return (
                    <div
                      key={row.gmail_message_id}
                      className={`bg-slate-900 border rounded-xl p-4 transition-colors ${
                        row.selected ? 'border-slate-700' : 'border-slate-800 opacity-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, selected: e.target.checked } : r))}
                          className="mt-1 w-4 h-4 accent-emerald-500 flex-shrink-0 cursor-pointer"
                        />

                        <div className="flex-1 min-w-0 space-y-3">
                          {/* Top row: description + amount */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white truncate">{row.description}</p>
                              <p className="text-xs text-slate-500 truncate mt-0.5">{row.subject}</p>
                            </div>
                            <p className={`text-sm font-bold flex-shrink-0 ${row.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {row.type === 'income' ? '+' : '−'}{fmt.money(row.amount ?? 0)}
                            </p>
                          </div>

                          {/* Bottom row: controls */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {/* Date */}
                            <div className="space-y-1 min-w-0">
                              <label className="text-slate-500">Fecha</label>
                              <input
                                type="date"
                                value={row.date_override}
                                onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, date_override: e.target.value } : r))}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-emerald-500 text-xs"
                              />
                            </div>

                            {/* Ledger */}
                            {ledgers.length > 0 && (
                              <div className="space-y-1">
                                <label className="text-slate-500">Cuenta</label>
                                <div className="relative">
                                  <select
                                    value={row.ledger_id}
                                    onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, ledger_id: e.target.value } : r))}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-6 pr-6 py-1.5 text-white focus:outline-none focus:border-emerald-500 text-xs appearance-none"
                                  >
                                    <option value="">Sin cuenta</option>
                                    {ledgers.map(l => (
                                      <option key={l.id} value={l.id}>{l.name}</option>
                                    ))}
                                  </select>
                                  {lColor && (
                                    <div
                                      className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 rounded-sm pointer-events-none"
                                      style={{ background: `linear-gradient(to right, ${lColor.dark} 35%, ${lColor.main} 35%)` }}
                                    />
                                  )}
                                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Category + confidence */}
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            {row.category && (
                              <span className="px-2 py-0.5 bg-slate-800 rounded-md text-slate-400">{row.category}</span>
                            )}
                            <span className="text-slate-600">
                              {Math.round((row.confidence ?? 0) * 100)}% confianza
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Import button */}
              <button
                onClick={handleImport}
                disabled={importing || selectedCount === 0}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {importing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</>
                ) : (
                  <><Download className="w-4 h-4" /> Importar {selectedCount} transaccion{selectedCount !== 1 ? 'es' : ''}</>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
