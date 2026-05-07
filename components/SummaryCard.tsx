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
    <div className={`rounded-xl border p-3 md:p-5 ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider leading-tight">{title}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className={`w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${iconStyles[variant]}`}>
          <Icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
        </div>
      </div>
      <p className={`text-lg md:text-2xl font-bold mt-2 md:mt-3 ${amountStyles[variant]}`}>
        {formatCurrency(Math.abs(amount))}
      </p>
    </div>
  );
}
