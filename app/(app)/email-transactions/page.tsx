'use client';

import { useState, useEffect, useCallback } from 'react';
import { Check, X, Mail, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { EmailTransaction } from '@/lib/db';

export default function EmailTransactionsPage() {
  const [transactions, setTransactions] = useState<EmailTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [gmailRes, txRes] = await Promise.all([
        fetch('/api/gmail'),
        fetch('/api/email-transactions'),
      ]);
      if (gmailRes.ok) {
        const gmailData = await gmailRes.json() as { connected: boolean };
        setGmailConnected(gmailData.connected);
      }
      if (txRes.ok) {
        const txData = await txRes.json() as EmailTransaction[];
        setTransactions(Array.isArray(txData) ? txData : []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAction = async (id: string, action: 'confirm' | 'reject') => {
    setActionLoading(id + action);
    try {
      const res = await fetch(`/api/email-transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setTransactions(prev => prev.filter(t => t.id !== id));
        if (action === 'confirm') {
          window.dispatchEvent(new Event('finanzas:refresh'));
        }
      }
    } catch {
      // silently fail
    } finally {
      setActionLoading(null);
    }
  };

  const formatAmount = (amount: number, type: 'income' | 'expense') => {
    const formatted = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
    return type === 'income' ? `+${formatted}` : `-${formatted}`;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Correos detectados</h1>
        <p className="text-slate-400 text-sm">Transacciones bancarias encontradas en tu Gmail</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
        </div>
      ) : gmailConnected === false ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-3">
          <Mail className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-slate-400">Gmail no está conectado</p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Conectar Gmail
          </Link>
        </div>
      ) : transactions.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-2">
          <Mail className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-slate-400">No hay transacciones pendientes en tu correo</p>
          <p className="text-slate-500 text-sm">
            Ve a{' '}
            <Link href="/settings" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
              Ajustes
            </Link>{' '}
            para revisar correos nuevos
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map(tx => (
            <div key={tx.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {tx.bankName && (
                    <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 rounded-full px-2 py-0.5">
                      {tx.bankName}
                    </span>
                  )}
                  <span className={`text-xs rounded-full px-2 py-0.5 border ${
                    tx.type === 'income'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}>
                    {tx.type === 'income' ? 'Ingreso' : 'Gasto'}
                  </span>
                  <span className="text-xs bg-slate-800 text-slate-400 border border-slate-700 rounded-full px-2 py-0.5">
                    {tx.category}
                  </span>
                </div>
                <span className={`text-lg font-bold flex-shrink-0 ${
                  tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {formatAmount(tx.amount, tx.type)}
                </span>
              </div>

              <div>
                <p className="text-white text-sm font-medium">{tx.description}</p>
                <p className="text-slate-500 text-xs mt-0.5">{tx.date}</p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleAction(tx.id, 'confirm')}
                  disabled={actionLoading !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {actionLoading === tx.id + 'confirm' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  Confirmar
                </button>
                <button
                  onClick={() => handleAction(tx.id, 'reject')}
                  disabled={actionLoading !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {actionLoading === tx.id + 'reject' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <X className="w-3.5 h-3.5" />
                  )}
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
