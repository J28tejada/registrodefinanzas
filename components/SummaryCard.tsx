import { LucideIcon } from 'lucide-react';
import { formatCurrency } from '@/lib/types';

interface SummaryCardProps {
  title: string;
  amount: number;
  icon: LucideIcon;
  variant: 'income' | 'expense' | 'balance' | 'personal' | 'business';
  subtitle?: string;
}

const variantStyles = {
  income: 'border-emerald-500/30 bg-emerald-500/5',
  expense: 'border-rose-500/30 bg-rose-500/5',
  balance: 'border-blue-500/30 bg-blue-500/5',
  personal: 'border-violet-500/30 bg-violet-500/5',
  business: 'border-blue-500/30 bg-blue-500/5',
};

const iconStyles = {
  income: 'text-emerald-400 bg-emerald-500/10',
  expense: 'text-rose-400 bg-rose-500/10',
  balance: 'text-blue-400 bg-blue-500/10',
  personal: 'text-violet-400 bg-violet-500/10',
  business: 'text-blue-400 bg-blue-500/10',
};

const amountStyles = {
  income: 'text-emerald-400',
  expense: 'text-rose-400',
  balance: 'text-blue-400',
  personal: 'text-violet-400',
  business: 'text-blue-400',
};

export default function SummaryCard({ title, amount, icon: Icon, variant, subtitle }: SummaryCardProps) {
  return (
    <div className={`rounded-xl border p-5 ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{title}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconStyles[variant]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className={`text-2xl font-bold mt-3 ${amountStyles[variant]}`}>
        {formatCurrency(Math.abs(amount))}
      </p>
      {amount < 0 && variant === 'balance' && (
        <p className="text-xs text-rose-400 mt-1">Balance negativo</p>
      )}
    </div>
  );
}
