export type TransactionType = 'income' | 'expense';
export type TransactionScope = 'personal' | 'business';
export type TransactionSource = 'manual' | 'voice' | 'ai' | 'whatsapp' | 'telegram';
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

// ─── Configuración regional ───────────────────────────────────────────────────

export interface UserSettings {
  user_id: string;
  /** Código ISO 4217: DOP, USD, EUR… */
  currency: string;
  /** Locale BCP 47: define separadores de miles y formato de fecha. */
  locale: string;
  /** IANA: con qué zona se resuelven "hoy" y "ayer". */
  timezone: string;
}

/**
 * República Dominicana por defecto, que es de donde arrancó la app. Cada
 * usuario lo cambia en Configuración; nada del código asume estos valores.
 */
export const DEFAULT_SETTINGS: Omit<UserSettings, 'user_id'> = {
  currency: 'DOP',
  locale: 'es-DO',
  timezone: 'America/Santo_Domingo',
};

export interface CurrencyOption {
  code: string;
  name: string;
  locale: string;
}

/** Las monedas de la lista. Igual se puede escribir cualquier código ISO. */
export const CURRENCIES: CurrencyOption[] = [
  { code: 'DOP', name: 'Peso dominicano',        locale: 'es-DO' },
  { code: 'USD', name: 'Dólar estadounidense',   locale: 'en-US' },
  { code: 'EUR', name: 'Euro',                   locale: 'es-ES' },
  { code: 'MXN', name: 'Peso mexicano',          locale: 'es-MX' },
  { code: 'COP', name: 'Peso colombiano',        locale: 'es-CO' },
  { code: 'ARS', name: 'Peso argentino',         locale: 'es-AR' },
  { code: 'CLP', name: 'Peso chileno',           locale: 'es-CL' },
  { code: 'PEN', name: 'Sol peruano',            locale: 'es-PE' },
  { code: 'UYU', name: 'Peso uruguayo',          locale: 'es-UY' },
  { code: 'BOB', name: 'Boliviano',              locale: 'es-BO' },
  { code: 'PYG', name: 'Guaraní paraguayo',      locale: 'es-PY' },
  { code: 'VES', name: 'Bolívar venezolano',     locale: 'es-VE' },
  { code: 'CRC', name: 'Colón costarricense',    locale: 'es-CR' },
  { code: 'GTQ', name: 'Quetzal guatemalteco',   locale: 'es-GT' },
  { code: 'HNL', name: 'Lempira hondureño',      locale: 'es-HN' },
  { code: 'NIO', name: 'Córdoba nicaragüense',   locale: 'es-NI' },
  { code: 'PAB', name: 'Balboa panameño',        locale: 'es-PA' },
  { code: 'CUP', name: 'Peso cubano',            locale: 'es-CU' },
  { code: 'BRL', name: 'Real brasileño',         locale: 'pt-BR' },
  { code: 'GBP', name: 'Libra esterlina',        locale: 'en-GB' },
  { code: 'CAD', name: 'Dólar canadiense',       locale: 'en-CA' },
  { code: 'CHF', name: 'Franco suizo',           locale: 'de-CH' },
  { code: 'JPY', name: 'Yen japonés',            locale: 'ja-JP' },
  { code: 'CNY', name: 'Yuan chino',             locale: 'zh-CN' },
  { code: 'INR', name: 'Rupia india',            locale: 'en-IN' },
  { code: 'AUD', name: 'Dólar australiano',      locale: 'en-AU' },
  { code: 'NZD', name: 'Dólar neozelandés',      locale: 'en-NZ' },
  { code: 'ZAR', name: 'Rand sudafricano',       locale: 'en-ZA' },
  { code: 'NGN', name: 'Naira nigeriana',        locale: 'en-NG' },
  { code: 'MAD', name: 'Dírham marroquí',        locale: 'fr-MA' },
  { code: 'AED', name: 'Dírham de los EAU',      locale: 'ar-AE' },
  { code: 'TRY', name: 'Lira turca',             locale: 'tr-TR' },
  { code: 'PHP', name: 'Peso filipino',          locale: 'en-PH' },
  { code: 'SEK', name: 'Corona sueca',           locale: 'sv-SE' },
  { code: 'NOK', name: 'Corona noruega',         locale: 'nb-NO' },
  { code: 'PLN', name: 'Zloty polaco',           locale: 'pl-PL' },
];

// ─── Entidades ────────────────────────────────────────────────────────────────

/** Quien crea la cuenta es `owner`; a quien invita entra como `member`. */
export type LedgerRole = 'owner' | 'member';

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
  /** Rol de quien consulta sobre esta cuenta. */
  role: LedgerRole;
  /** Cuántas personas tienen acceso. 1 = no está compartida. */
  memberCount: number;
}

export interface LedgerMember {
  user_id: string;
  ledger_id: string;
  role: LedgerRole;
  email: string;
  name: string;
  joined_at: string;
}

export interface LedgerInvite {
  code: string;
  ledger_id: string;
  ledger_name: string;
  expires_at: string;
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
  /** Ruta del comprobante en el bucket `receipts`, si nació de una foto. */
  receipt_url?: string | null;
  /** Efectivo, tarjeta, transferencia… lo captura el agente si se menciona. */
  payment_method?: string | null;
}

export interface TransactionFilters {
  ledger_id?: string;
  type?: TransactionType;
  scope?: TransactionScope;
  category?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
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

/** Tope mensual de gasto para una categoría. */
export interface Budget {
  id: string;
  category: string;
  amount: number;
  created_at: string;
}

export interface BudgetProgress extends Budget {
  spent: number;
  remaining: number;
  percent: number;
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

export interface EmailConnection {
  id: string;
  email: string;
  access_token: string;
  refresh_token: string | null;
  token_expiry: number | null;
  created_at: string;
}

export interface EmailTransaction {
  gmail_message_id: string;
  subject: string;
  from_address: string;
  sent_date: string;
  isTransaction: boolean;
  type: TransactionType | null;
  amount: number | null;
  description: string | null;
  category: string | null;
  confidence: number;
}

// ─── Categorías ───────────────────────────────────────────────────────────────

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

/** Todas las categorías de gasto: las que pueden tener presupuesto. */
export function expenseCategories(): string[] {
  return [...CATEGORIES.personalExpense, ...CATEGORIES.businessExpense];
}
