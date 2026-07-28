'use client';

import { Transaction, formatCurrency, formatDate, LEDGER_COLOR_MAP } from '@/lib/types';
import { useLedger } from './LedgerContext';
import { Pencil, Trash2, Mic, Bot, Pencil as PencilIcon, MessageCircle, Receipt } from 'lucide-react';

// Una trazabilidad que solo sirve consultando la base no le sirve al usuario (§5.5).
const sourceBadge = {
  voice: { icon: Mic, cls: 'text-slate-500', label: 'por voz' },
  ai: { icon: Bot, cls: 'text-slate-500', label: 'con IA' },
  manual: { icon: PencilIcon, cls: 'text-slate-600', label: 'a mano' },
  whatsapp: { icon: MessageCircle, cls: 'text-emerald-500', label: 'vía WhatsApp' },
};

interface TransactionListProps {
  transactions: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
  loading?: boolean;
}

export default function TransactionList({ transactions, onEdit, onDelete, loading }: TransactionListProps) {
  const { currentLedger, ledgers } = useLedger();

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl h-16 animate-pulse" />
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p className="text-4xl mb-3">💸</p>
        <p>No hay transacciones aquí.</p>
        <p className="text-sm mt-1">Agrega tu primera transacción con el botón +</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {transactions.map(tx => {
        const Source = sourceBadge[tx.source] ?? sourceBadge.manual;
        const SourceIcon = Source.icon;
        const txLedger = tx.ledger_id ? ledgers.find(l => l.id === tx.ledger_id) : null;
        const showLedgerBadge = !currentLedger && txLedger;

        return (
          <div
            key={tx.id}
            className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl px-4 py-3 flex items-center gap-3 group transition-colors"
          >
            {/* Amount indicator */}
            <div className={`w-2 h-10 rounded-full flex-shrink-0 ${tx.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`} />

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-white font-medium truncate">{tx.description}</span>
                {showLedgerBadge && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded font-medium"
                    style={{
                      backgroundColor: LEDGER_COLOR_MAP[txLedger.color].main + '22',
                      color: LEDGER_COLOR_MAP[txLedger.color].text,
                    }}
                  >
                    {txLedger.name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 flex-wrap">
                <span>{tx.category}</span>
                <span>·</span>
                <span>{formatDate(tx.date)}</span>
                {tx.payment_method && (
                  <>
                    <span>·</span>
                    <span>{tx.payment_method}</span>
                  </>
                )}
                <span>·</span>
                <span className={`flex items-center gap-1 ${Source.cls}`} title={Source.label}>
                  <SourceIcon className="w-3 h-3" />
                  {tx.source === 'whatsapp' && <span>vía WhatsApp</span>}
                </span>
                {tx.receipt_url && (
                  <>
                    <span>·</span>
                    <a
                      href={tx.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition-colors"
                    >
                      <Receipt className="w-3 h-3" /> recibo
                    </a>
                  </>
                )}
              </div>
            </div>

            {/* Amount */}
            <div className="text-right flex-shrink-0">
              <p className={`font-semibold ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {tx.type === 'income' ? '+' : '−'}{formatCurrency(tx.amount)}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(tx)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(tx.id)}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
