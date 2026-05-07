export type TransactionType = 'income' | 'expense';
export type TransactionScope = 'personal' | 'business';
export type TransactionSource = 'manual' | 'voice' | 'ai';

export interface Transaction {
  id: string;
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
  type?: TransactionType;
  scope?: TransactionScope;
  category?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface Summary {
  personalIncome: number;
  personalExpenses: number;
  businessIncome: number;
  businessExpenses: number;
  totalIncome: number;
  totalExpenses: number;
  personalBalance: number;
  businessBalance: number;
  totalBalance: number;
  byCategory: CategorySummary[];
}

export interface CategorySummary {
  category: string;
  type: TransactionType;
  scope: TransactionScope;
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
