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
  /** Viene de Google; con login por correo queda en null. */
  avatar_url: string | null;
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
  /** La tarjeta o medio de pago, cuando está enlazado a uno de la lista. */
  card_id?: string | null;
  /** Quién lo registró. En una cuenta compartida no siempre sos vos. */
  author_id?: string | null;
  /** Su nombre, para mostrarlo sin tener que resolver el id en cada vista. */
  author_name?: string | null;
}

export interface TransactionFilters {
  ledger_id?: string;
  type?: TransactionType;
  scope?: TransactionScope;
  category?: string;
  /** Lo pagado con una tarjeta concreta. */
  card_id?: string;
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

// ─── Tarjetas y medios de pago ────────────────────────────────────────────────

export type CardKind = 'credit' | 'debit' | 'cash' | 'transfer' | 'other';

export const CARD_KIND_LABEL: Record<CardKind, string> = {
  credit: 'Crédito',
  debit: 'Débito',
  cash: 'Efectivo',
  transfer: 'Transferencia',
  other: 'Otro',
};

export interface Card {
  id: string;
  name: string;
  kind: CardKind;
  /** Los últimos cuatro dígitos, o vacío. Texto: "0042" conserva los ceros. */
  last4: string;
  issuer: string;
  color: LedgerColor;
  archived: boolean;
  created_at: string;
}

export interface CardWithUsage extends Card {
  /** Cuántos movimientos la usan. Decide si borrarla se puede o hay que avisar. */
  usos: number;
  /** Gasto del mes en curso, para verlo sin salir de la sección. */
  gastoDelMes: number;
}

/** Un mes de la serie: cuánto se pagó con la tarjeta y en cuántos movimientos. */
export interface CardMonth {
  /** YYYY-MM */
  month: string;
  total: number;
  count: number;
}

/**
 * Todo lo que se muestra en el detalle de una tarjeta.
 *
 * El período es un mes, pero el histórico y la serie van igual: una tarjeta se
 * mira para saber si se está usando más que antes, y eso no se ve en un mes
 * suelto.
 */
export interface CardDetail {
  card: Card;
  /** Gasto del período pedido. */
  spent: number;
  /** Movimientos del período. */
  count: number;
  /** Gasto promedio por movimiento del período. 0 si no hubo ninguno. */
  average: number;
  /** Lo gastado con la tarjeta desde siempre. */
  spentAllTime: number;
  /** Todos los movimientos que la usan. Con 0 se la puede borrar. */
  countAllTime: number;
  /** Gasto del período por categoría, de mayor a menor. */
  byCategory: { category: string; total: number; count: number }[];
  /** Los últimos meses hasta el período pedido, del más viejo al más nuevo. */
  monthly: CardMonth[];
}

export interface CategorySummary {
  category: string;
  type: TransactionType;
  total: number;
  count: number;
}

/** Una categoría del usuario. Las de arranque salen de 0009_categorias.sql. */
export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  scope: TransactionScope;
  created_at: string;
}

export interface CategoryWithUsage extends Category {
  /** Cuántos movimientos la usan. Decide si borrarla se puede o hay que avisar. */
  usos: number;
}

/** Tope mensual de gasto para una categoría. */
export interface Budget {
  id: string;
  /** La cuenta a la que le pone el tope. Null = tope personal sobre todas. */
  ledger_id: string | null;
  category: string;
  amount: number;
  created_at: string;
}

export interface BudgetProgress extends Budget {
  spent: number;
  remaining: number;
  percent: number;
  /** Nombre de la cuenta, para distinguir dos topes de la misma categoría. */
  ledger_name: string | null;
  /** Si lo gastado incluye movimientos de otros miembros de la cuenta. */
  compartido: boolean;
}

// ─── Lista de compras ─────────────────────────────────────────────────────────

/** Cómo se mide el artículo. "2.5 libras de carne" es una compra normal. */
export const UNIDADES = ['unidad', 'libra', 'kg', 'litro', 'paquete', 'caja', 'docena'] as const;
export type Unidad = (typeof UNIDADES)[number];

/**
 * Los pasillos del supermercado, no las categorías contables.
 *
 * "Lácteos" y no "Alimentación": agrupar por la categoría del gasto pondría el
 * 90% de la lista en un solo grupo y no serviría para recorrer el súper. Son
 * sugerencias, no un catálogo cerrado — el campo es texto libre.
 */
export const PASILLOS = [
  'Frutas y verduras',
  'Carnes y pescados',
  'Lácteos y huevos',
  'Panadería',
  'Despensa',
  'Congelados',
  'Bebidas',
  'Limpieza',
  'Higiene personal',
  'Mascotas',
  'Otros',
];

export interface ShoppingItem {
  id: string;
  list_id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  /** Precio POR UNIDAD. El total del artículo es cantidad × precio. */
  unit_price: number;
  checked: boolean;
  created_at: string;
}

export interface ShoppingList {
  id: string;
  ledger_id: string | null;
  name: string;
  date: string;
  closed: boolean;
  /**
   * Lo pagado en la caja. Null mientras está abierta.
   *
   * Puede no coincidir con la suma de los artículos: impuestos, una oferta, un
   * precio distinto al de la góndola. Es el dato real del gasto.
   */
  paid_amount: number | null;
  /** El gasto que generó al cerrarse, si ya se cerró. */
  transaction_id: string | null;
  created_at: string;
}

export interface ShoppingListWithTotals extends ShoppingList {
  /** Lo que costaría la lista entera. */
  total: number;
  /** Lo que ya está en el carrito: lo tildado. */
  checkedTotal: number;
  items: number;
  checkedItems: number;
}

export interface ShoppingListDetail extends ShoppingListWithTotals {
  articulos: ShoppingItem[];
}

// ─── Deudas ───────────────────────────────────────────────────────────────────

export interface Debt {
  id: string;
  ledger_id: string | null;
  name: string;
  creditor: string;
  /** Cuánto se debe en total. */
  total_amount: number;
  /** La cuota "de papel". Lo que se paga de verdad puede ser otro monto. */
  installment_amount: number;
  installments: number;
  /** Mes de la primera cuota: con eso se sabe cuál toca ahora. */
  start_date: string;
  category: string;
  archived: boolean;
  notes: string;
  created_at: string;
}

export interface DebtPayment {
  id: string;
  debt_id: string;
  amount: number;
  date: string;
  transaction_id: string | null;
  created_at: string;
}

/**
 * Una deuda con sus números al día.
 *
 * Todo se deriva de lo efectivamente pagado, no de cuotas tildadas: si un mes
 * pagaste de más, esa plata adelanta la cuota siguiente sola.
 */
export interface DebtProgress extends Debt {
  /** Suma de todos los pagos. */
  paid: number;
  /** Lo que falta para saldarla. Nunca negativo. */
  remaining: number;
  /** 0–100 sobre el total. */
  percent: number;
  /** Cuántas cuotas cubre lo pagado, incluyendo fracciones adelantadas. */
  installmentsPaid: number;
  /** Pagado dentro del mes que se está mirando. */
  paidThisMonth: number;
  /** Cuánto falta este mes para cubrir la cuota. Nunca negativo. */
  dueThisMonth: number;
  /** 0–100 de la cuota del mes. */
  monthPercent: number;
  /** La cuota del mes quedó cubierta. */
  monthCovered: boolean;
  /** Ya no se debe nada. */
  settled: boolean;
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
//
// Ya no viven acá: son de cada usuario y salen de la tabla `categories`. La
// lista de siempre quedó como semilla en 0009_categorias.sql, que es lo que
// recibe quien se registra.
//
// En el servidor se leen con `getCategories(db, ...)` de lib/db.ts; en el
// navegador, con el hook `useCategories()`.
