export type TransactionType = 'income' | 'expense';
export type TransactionScope = 'personal' | 'business';
export type TransactionSource = 'manual' | 'voice' | 'ai';
export type LedgerColor = 'green' | 'blue' | 'purple' | 'orange' | 'red' | 'teal' | 'indigo' | 'pink';

export const LEDGER_COLOR_MAP: Record<LedgerColor, { main: string; dark: string; text: string }> = {
  green:  { main: '#059669', dark: '#065f46', text: '#d1fae5' },
  blue:   { main: '#3b82f6', dark: '#1d4ed8', text: '#dbeafe' },
  purple: { main: '#9333ea', dark: '#6b21a8', text: '#f3e8ff' },
  orange: { main: '#f97316', dark: '#c2410c', text: '#ffedd5' },
  red:    { main: '#ef4444', dark: '#b91c1c', text: '#fee2e2' },
  teal:   { main: '#14b8a6', dark: '#0f766e', text: '#ccfbf1' },
  indigo: { main: '#6366f1', dark: '#4338ca', text: '#e0e7ff' },
  pink:   { main: '#ec4899', dark: '#be185d', text: '#fce7f3' },
};

export interface Ledger {
  id: string;
  name: string;
  color: LedgerColor;
  type: TransactionScope;
  description: string;
  created_at: string;
}

export interface LedgerWithStats extends Ledger {
  transactionCount: number;
  balance: number;
}

export interface Transaction {
  id: string;
  ledger_id: string | null;
  type: TransactionType;
  scope: TransactionScope;
  amount: number;
  category: string;
  description: string;
  date: string;
  createdAt: string;
  source: TransactionSource;
}

export interface TransactionFilters {
  ledger_id?: string;
  type?: TransactionType;
  scope?: TransactionScope;
  category?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface Summary {
  totalIncome: number;
  totalExpenses: number;
  totalBalance: number;
  byCategory: CategorySummary[];
}

export interface CategorySummary {
  category: string;
  type: TransactionType;
  total: number;
  count: number;
}

export interface AIInterpretation {
  type: TransactionType | null;
  scope: TransactionScope | null;
  amount: number | null;
  category: string | null;
  description: string | null;
  date: string | null;
  confidence: number;
  suggestions: string[];
}

export const CATEGORIES = {
  personalExpense: [
    'Alimentación',
    'Transporte',
    'Salud',
    'Entretenimiento',
    'Ropa',
    'Educación',
    'Servicios básicos',
    'Hogar',
    'Suscripciones',
    'Otros personal',
  ],
  personalIncome: [
    'Salario',
    'Freelance',
    'Inversiones',
    'Regalo',
    'Otros ingreso personal',
  ],
  businessExpense: [
    'Materiales',
    'Marketing',
    'Equipo/Tecnología',
    'Transporte negocio',
    'Personal/Empleados',
    'Oficina',
    'Impuestos',
    'Servicios negocio',
    'Otros negocio',
  ],
  businessIncome: [
    'Ventas',
    'Servicios prestados',
    'Comisiones',
    'Proyectos',
    'Otros ingreso negocio',
  ],
} as const;

export function getCategories(type: TransactionType, scope: TransactionScope): string[] {
  if (type === 'expense' && scope === 'personal') return [...CATEGORIES.personalExpense];
  if (type === 'income' && scope === 'personal') return [...CATEGORIES.personalIncome];
  if (type === 'expense' && scope === 'business') return [...CATEGORIES.businessExpense];
  return [...CATEGORIES.businessIncome];
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
