'use client';

import { useState } from 'react';
import { KeyRound, Copy, Loader2, Unlink, ChevronDown, Check } from 'lucide-react';
import { useLedger } from './LedgerContext';
import { LEDGER_COLOR_MAP } from '@/lib/types';

export interface ChatLinkRow {
  id: string;
  channel: 'whatsapp' | 'telegram';
  external_id: string;
  ledger_id: string | null;
  created_at: string;
}

interface Props {
  channel: 'whatsapp' | 'telegram';
  chats: ChatLinkRow[];
  /** Cómo se lee el identificador: un teléfono no se muestra como un chat_id. */
  formatearId: (externalId: string) => string;
  instrucciones: React.ReactNode;
  onCambio: () => void | Promise<void>;
}

/**
 * Generar el código y administrar las conversaciones vinculadas. Es igual para
 * los dos canales: lo único que cambia es cómo se lee el identificador y las
 * instrucciones de a dónde mandarlo.
 */
export default function ChatLinkPanel({ channel, chats, formatearId, instrucciones, onCambio }: Props) {
  const { ledgers } = useLedger();

  const [ledgerDestino, setLedgerDestino] = useState('');
  const [codigo, setCodigo] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState('');

  const generar = async () => {
    setGenerando(true);
    setError('');
    try {
      const res = await fetch('/api/chats/link-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ledger_id: ledgerDestino || null, channel }),
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
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el código está a la vista igual.
    }
  };

  const desvincular = async (id: string, etiqueta: string) => {
    if (!confirm(`¿Desvincular ${etiqueta}? Dejará de poder anotar movimientos.`)) return;
    await fetch(`/api/chats/${id}`, { method: 'DELETE' });
    await onCambio();
  };

  const cambiarCuenta = async (id: string, ledgerId: string) => {
    await fetch(`/api/chats/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ledger_id: ledgerId || null }),
    });
    await onCambio();
  };

  return (
    <>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div>
          <p className="font-semibold text-white text-sm">Autorizá tu chat</p>
          <div className="text-xs text-slate-400 mt-0.5">{instrucciones}</div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-slate-500">Anotar en la cuenta</label>
          <div className="relative">
            <select
              value={ledgerDestino}
              onChange={e => setLedgerDestino(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-8 text-sm text-white focus:outline-none focus:border-emerald-500 appearance-none"
            >
              <option value="">Sin cuenta asignada</option>
              {ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <button
          onClick={generar}
          disabled={generando}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          Generar código de vinculación
        </button>

        {error && <p className="text-xs text-rose-400">{error}</p>}

        {codigo && (
          <div className="bg-slate-800 rounded-xl p-4 text-center space-y-2">
            <p className="text-xs text-slate-400">Mandá este código al bot</p>
            <div className="flex items-center justify-center gap-2">
              <p className="text-2xl sm:text-3xl font-mono font-bold tracking-[0.15em] sm:tracking-[0.2em] text-emerald-400">{codigo}</p>
              <button
                onClick={copiar}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                title="Copiar"
              >
                {copiado ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500">Vence en 15 minutos y sirve una sola vez.</p>
            <div className="pt-2 border-t border-slate-700/60 text-left space-y-1">
              <p className="text-xs text-slate-400">
                <span className="text-slate-300 font-medium">Chat privado:</span> mandáselo al bot y tus
                gastos se anotan en la cuenta elegida.
              </p>
              <p className="text-xs text-slate-400">
                <span className="text-slate-300 font-medium">Grupo:</span> mandalo dentro del grupo y todos
                sus gastos van a esa cuenta. Cada integrante tiene que vincular además su chat privado,
                para que lo que anote quede a su nombre.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-300">Chats autorizados</p>
        {chats.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm bg-slate-900 border border-slate-800 rounded-2xl">
            Todavía no hay ninguno.
          </div>
        )}
        {chats.map(c => {
          const ledger = ledgers.find(l => l.id === c.ledger_id);
          const color = ledger ? LEDGER_COLOR_MAP[ledger.color] : null;
          const etiqueta = formatearId(c.external_id);
          return (
            <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{etiqueta}</p>
                <div className="relative mt-1">
                  <select
                    value={c.ledger_id ?? ''}
                    onChange={e => cambiarCuenta(c.id, e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-md pl-6 pr-6 py-1 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 appearance-none"
                  >
                    <option value="">Sin cuenta asignada</option>
                    {ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  {color && (
                    <div
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 rounded-sm pointer-events-none"
                      style={{ background: `linear-gradient(to right, ${color.dark} 35%, ${color.main} 35%)` }}
                    />
                  )}
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <button
                onClick={() => desvincular(c.id, etiqueta)}
                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors flex-shrink-0"
                title="Desvincular"
              >
                <Unlink className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
