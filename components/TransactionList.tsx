'use client';

import { Transaction, PaymentMethod, formatCurrency, formatDate } from '@/lib/types';
import { Pencil, Trash2, Mic, Bot, Pencil as PencilIcon, Banknote, ArrowLeftRight, CreditCard, Mail } from 'lucide-react';

const paymentIcon: Record<PaymentMethod, React.ElementType> = {
  cash: Banknote,
  transfer: ArrowLeftRight,
  card: CreditCard,
};
const paymentLabel: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
};

const scopeBadge = {
  personal: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  business: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

const sourceBadge = {
  voice: { icon: Mic, label: 'Voz', cls: 'text-slate-500' },
  ai: { icon: Bot, label: 'IA', cls: 'text-slate-500' },
  manual: { icon: PencilIcon, label: 'Manual', cls: 'text-slate-600' },
  email: { icon: Mail, label: 'Correo', cls: 'text-blue-500' },
};

interface TransactionListProps {
  transactions: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
  loading?: boolean;
}

export default function TransactionList({ transactions, onEdit, onDelete, loading }: TransactionListProps) {
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
        const Source = sourceBadge[tx.source];
        const SourceIcon = Source.icon;
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
                <span className={`text-xs px-1.5 py-0.5 rounded border ${scopeBadge[tx.scope]}`}>
                  {tx.scope === 'personal' ? 'Personal' : 'Negocio'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 flex-wrap">
                <span>{tx.category}</span>
                <span>·</span>
                <span>{formatDate(tx.date)}</span>
                <span>·</span>
                {tx.paymentMethod ? (() => {
                  const PIcon = paymentIcon[tx.paymentMethod];
                  const label = tx.paymentMethod === 'card'
                    ? (tx.cardName ? `Tarjeta ${tx.cardName}` : 'Tarjeta')
                    : paymentLabel[tx.paymentMethod];
                  return (
                    <span className="flex items-center gap-1 text-slate-400 font-medium">
                      <PIcon className="w-3 h-3 flex-shrink-0" />
                      {label}
                    </span>
                  );
                })() : (
                  <span className="flex items-center gap-0.5">
                    <SourceIcon className="w-3 h-3" />
                  </span>
                )}
              </div>
            </div>

            {/* Amount */}
            <div className="text-right flex-shrink-0">
              <p className={`font-semibold ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {tx.type === 'income' ? '+' : '−'}{formatCurrency(tx.amount)}
              </p>
            </div>

            {/* Actions — always visible on mobile, hover on desktop */}
            <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(tx)}
                className="p-2 md:p-1.5 text-slate-400 hover:text-white active:text-white hover:bg-slate-800 active:bg-slate-800 rounded-lg transition-colors"
              >
                <Pencil className="w-4 h-4 md:w-3.5 md:h-3.5" />
              </button>
              <button
                onClick={() => onDelete(tx.id)}
                className="p-2 md:p-1.5 text-slate-400 hover:text-rose-400 active:text-rose-400 hover:bg-rose-500/10 active:bg-rose-500/10 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
