'use client';

import Link from 'next/link';
import { Mail, X } from 'lucide-react';

interface EmailTransactionBannerProps {
  count: number;
  onDismiss: () => void;
}

export default function EmailTransactionBanner({ count, onDismiss }: EmailTransactionBannerProps) {
  if (count <= 0) return null;

  return (
    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
      <Mail className="w-4 h-4 text-blue-400 flex-shrink-0" />
      <p className="text-sm text-blue-300 flex-1">
        Detecté <span className="font-semibold">{count}</span> transacción{count !== 1 ? 'es' : ''} en tu correo
      </p>
      <Link
        href="/email-transactions"
        className="text-xs font-medium text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors flex-shrink-0"
      >
        Revisar
      </Link>
      <button
        onClick={onDismiss}
        className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
        aria-label="Cerrar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
