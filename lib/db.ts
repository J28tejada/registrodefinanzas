import { SupabaseClient } from '@supabase/supabase-js';
import {
  Budget,
  BudgetProgress,
  EmailConnection,
  Ledger,
  LedgerWithStats,
  Summary,
  Transaction,
  TransactionFilters,
  UserSettings,
  DEFAULT_SETTINGS,
} from './types';

/**
 * Contexto de datos de una petición: cliente de Supabase + dueño de los datos.
 *
 * Todas las funciones de acá lo piden. Con la sesión del usuario, RLS ya filtra
 * por sí sola y el `user_id` es redundante; con la service role (el webhook de
 * WhatsApp) es lo único que separa a un usuario de otro. Por eso se filtra
 * siempre en las dos, sin excepción.
 */
export interface Db {
  supabase: SupabaseClient;
  userId: string;
}

function fallar(contexto: string, error: { message: string } | null): never {
  throw new Error(`${contexto}: ${error?.message ?? 'error desconocido'}`);
}

// ─── Configuración del usuario ────────────────────────────────────────────────

function rowToSettings(row: Record<string, unknown> | null, userId: string): UserSettings {
  if (!row) return { user_id: userId, ...DEFAULT_SETTINGS };
  return {
    user_id: userId,
    currency: (row.currency as string) || DEFAULT_SETTINGS.currency,
    locale: (row.locale as string) || DEFAULT_SETTINGS.locale,
    timezone: (row.timezone as string) || DEFAULT_SETTINGS.timezone,
  };
}

/** Si el usuario todavía no guardó nada, devuelve los valores por defecto. */
export async function getSettings(db: Db): Promise<UserSettings> {
  const { data, error } = await db.supabase
    .from('user_settings')
    .select('currency, locale, timezone')
    .eq('user_id', db.userId)
    .maybeSingle();
  if (error) fallar('No se pudo leer la configuración', error);
  return rowToSettings(data, db.userId);
}

export async function saveSettings(
  db: Db,
  cambios: Partial<Omit<UserSettings, 'user_id'>>,
): Promise<UserSettings> {
  const actual = await getSettings(db);
  const nuevo = { ...actual, ...cambios };
  const { error } = await db.supabase.from('user_settings').upsert(
    {
      user_id: db.userId,
      currency: nuevo.currency,
      locale: nuevo.locale,
      timezone: nuevo.timezone,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) fallar('No se pudo guardar la configuración', error);
  return nuevo;
}

// ─── Cuentas ──────────────────────────────────────────────────────────────────

function rowToLedger(row: Record<string, unknown>): Ledger {
  return {
    id: row.id as string,
    name: row.name as string,
    color: row.color as Ledger['color'],
    type: row.type as Ledger['type'],
    description: (row.description as string) ?? '',
    created_at: row.created_at as string,
  };
}

export async function getAllLedgersWithStats(db: Db): Promise<LedgerWithStats[]> {
  const [ledgersRes, statsRes] = await Promise.all([
    db.supabase.from('ledgers').select('*').eq('user_id', db.userId).order('created_at'),
    db.supabase.rpc('ledger_stats', { p_user: db.userId }),
  ]);
  if (ledgersRes.error) fallar('No se pudieron leer las cuentas', ledgersRes.error);
  if (statsRes.error) fallar('No se pudieron calcular los totales de las cuentas', statsRes.error);

  const stats = new Map<string, { tx_count: number; balance: number }>(
    ((statsRes.data ?? []) as Record<string, unknown>[]).map(r => [
      r.ledger_id as string,
      { tx_count: Number(r.tx_count ?? 0), balance: Number(r.balance ?? 0) },
    ]),
  );

  return (ledgersRes.data ?? []).map(row => ({
    ...rowToLedger(row),
    transactionCount: stats.get(row.id as string)?.tx_count ?? 0,
    balance: stats.get(row.id as string)?.balance ?? 0,
  }));
}

export async function getLedgerById(db: Db, id: string): Promise<Ledger | null> {
  const { data, error } = await db.supabase
    .from('ledgers').select('*').eq('user_id', db.userId).eq('id', id).maybeSingle();
  if (error) fallar('No se pudo leer la cuenta', error);
  return data ? rowToLedger(data) : null;
}

export async function createLedger(
  db: Db,
  datos: Omit<Ledger, 'id' | 'created_at'>,
): Promise<Ledger> {
  const { data, error } = await db.supabase
    .from('ledgers')
    .insert({
      user_id: db.userId,
      name: datos.name,
      color: datos.color,
      type: datos.type,
      description: datos.description ?? '',
    })
    .select()
    .single();
  if (error) fallar('No se pudo crear la cuenta', error);
  return rowToLedger(data);
}

export async function updateLedger(
  db: Db,
  id: string,
  datos: Partial<Omit<Ledger, 'id' | 'created_at'>>,
): Promise<Ledger | null> {
  const campos: Record<string, unknown> = {};
  if (datos.name !== undefined) campos.name = datos.name;
  if (datos.color !== undefined) campos.color = datos.color;
  if (datos.type !== undefined) campos.type = datos.type;
  if (datos.description !== undefined) campos.description = datos.description;
  if (Object.keys(campos).length === 0) return getLedgerById(db, id);

  const { data, error } = await db.supabase
    .from('ledgers').update(campos).eq('user_id', db.userId).eq('id', id).select().maybeSingle();
  if (error) fallar('No se pudo actualizar la cuenta', error);
  return data ? rowToLedger(data) : null;
}

export async function deleteLedger(db: Db, id: string): Promise<{ ok: boolean; error?: string }> {
  const { count, error: countError } = await db.supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', db.userId)
    .eq('ledger_id', id);
  if (countError) fallar('No se pudo verificar la cuenta', countError);
  if ((count ?? 0) > 0) {
    return { ok: false, error: `La cuenta tiene ${count} transacciones. Elimínalas primero.` };
  }

  const { error } = await db.supabase
    .from('ledgers').delete().eq('user_id', db.userId).eq('id', id);
  if (error) fallar('No se pudo eliminar la cuenta', error);
  return { ok: true };
}

// ─── Movimientos ──────────────────────────────────────────────────────────────

function rowToTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: row.id as string,
    ledger_id: (row.ledger_id as string) ?? null,
    type: row.type as Transaction['type'],
    scope: row.scope as Transaction['scope'],
    amount: Number(row.amount),
    category: row.category as string,
    description: row.description as string,
    date: row.date as string,
    createdAt: row.created_at as string,
    source: ((row.source as string) || 'manual') as Transaction['source'],
    receipt_url: (row.receipt_url as string) ?? null,
    payment_method: (row.payment_method as string) ?? null,
  };
}

export async function getAllTransactions(
  db: Db,
  filters?: TransactionFilters,
): Promise<Transaction[]> {
  let q = db.supabase.from('transactions').select('*').eq('user_id', db.userId);

  if (filters?.ledger_id) q = q.eq('ledger_id', filters.ledger_id);
  if (filters?.type) q = q.eq('type', filters.type);
  if (filters?.scope) q = q.eq('scope', filters.scope);
  if (filters?.category) q = q.eq('category', filters.category);
  if (filters?.startDate) q = q.gte('date', filters.startDate);
  if (filters?.endDate) q = q.lte('date', filters.endDate);
  if (filters?.search) {
    const patron = `%${filters.search.replace(/[%,()]/g, '')}%`;
    q = q.or(`description.ilike.${patron},category.ilike.${patron}`);
  }
  if (filters?.limit) q = q.limit(filters.limit);

  const { data, error } = await q.order('date', { ascending: false }).order('created_at', { ascending: false });
  if (error) fallar('No se pudieron leer los movimientos', error);
  return (data ?? []).map(rowToTransaction);
}

export async function getTransactionById(db: Db, id: string): Promise<Transaction | null> {
  const { data, error } = await db.supabase
    .from('transactions').select('*').eq('user_id', db.userId).eq('id', id).maybeSingle();
  if (error) fallar('No se pudo leer el movimiento', error);
  return data ? rowToTransaction(data) : null;
}

export async function createTransaction(
  db: Db,
  datos: Omit<Transaction, 'id' | 'createdAt'>,
): Promise<Transaction> {
  const { data, error } = await db.supabase
    .from('transactions')
    .insert({
      user_id: db.userId,
      ledger_id: datos.ledger_id ?? null,
      type: datos.type,
      scope: datos.scope,
      amount: datos.amount,
      category: datos.category,
      description: datos.description,
      date: datos.date,
      source: datos.source ?? 'manual',
      receipt_url: datos.receipt_url ?? null,
      payment_method: datos.payment_method ?? null,
    })
    .select()
    .single();
  if (error) fallar('No se pudo guardar el movimiento', error);
  return rowToTransaction(data);
}

export async function updateTransaction(
  db: Db,
  id: string,
  datos: Partial<Omit<Transaction, 'id' | 'createdAt'>>,
): Promise<Transaction | null> {
  const campos: Record<string, unknown> = {};
  for (const clave of ['ledger_id', 'type', 'scope', 'amount', 'category', 'description', 'date', 'source', 'receipt_url', 'payment_method'] as const) {
    if (datos[clave] !== undefined) campos[clave] = datos[clave];
  }
  if (Object.keys(campos).length === 0) return getTransactionById(db, id);

  const { data, error } = await db.supabase
    .from('transactions').update(campos).eq('user_id', db.userId).eq('id', id).select().maybeSingle();
  if (error) fallar('No se pudo actualizar el movimiento', error);
  return data ? rowToTransaction(data) : null;
}

export async function deleteTransaction(db: Db, id: string): Promise<boolean> {
  const { data, error } = await db.supabase
    .from('transactions').delete().eq('user_id', db.userId).eq('id', id).select('id');
  if (error) fallar('No se pudo eliminar el movimiento', error);
  return (data ?? []).length > 0;
}

export async function getSummary(
  db: Db,
  ledgerId?: string,
  startDate?: string,
  endDate?: string,
): Promise<Summary> {
  const { data, error } = await db.supabase.rpc('summary_by_category', {
    p_user: db.userId,
    p_ledger: ledgerId ?? null,
    p_start: startDate ?? null,
    p_end: endDate ?? null,
  });
  if (error) fallar('No se pudo calcular el resumen', error);

  const byCategory = ((data ?? []) as Record<string, unknown>[]).map(r => ({
    category: r.category as string,
    type: r.type as 'income' | 'expense',
    total: Number(r.total ?? 0),
    count: Number(r.tx_count ?? 0),
  }));

  const totalIncome = byCategory.filter(c => c.type === 'income').reduce((s, c) => s + c.total, 0);
  const totalExpenses = byCategory.filter(c => c.type === 'expense').reduce((s, c) => s + c.total, 0);

  return {
    totalIncome,
    totalExpenses,
    totalBalance: totalIncome - totalExpenses,
    byCategory,
  };
}

// ─── Presupuestos ─────────────────────────────────────────────────────────────

function rowToBudget(row: Record<string, unknown>): Budget {
  return {
    id: row.id as string,
    category: row.category as string,
    amount: Number(row.amount),
    created_at: row.created_at as string,
  };
}

export async function getBudgets(db: Db): Promise<Budget[]> {
  const { data, error } = await db.supabase
    .from('budgets').select('*').eq('user_id', db.userId).order('category');
  if (error) fallar('No se pudieron leer los presupuestos', error);
  return (data ?? []).map(rowToBudget);
}

/** Presupuestos con lo gastado en el período, listo para pintar la barra. */
export async function getBudgetProgress(
  db: Db,
  startDate: string,
  endDate: string,
): Promise<BudgetProgress[]> {
  const [budgets, gastoRes] = await Promise.all([
    getBudgets(db),
    db.supabase.rpc('spent_by_category', { p_user: db.userId, p_start: startDate, p_end: endDate }),
  ]);
  if (gastoRes.error) fallar('No se pudo calcular lo gastado', gastoRes.error);

  const gastado = new Map<string, number>(
    ((gastoRes.data ?? []) as Record<string, unknown>[]).map(r => [r.category as string, Number(r.spent ?? 0)]),
  );

  return budgets.map(b => {
    const spent = gastado.get(b.category) ?? 0;
    return {
      ...b,
      spent,
      remaining: b.amount - spent,
      percent: b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0,
    };
  });
}

export async function upsertBudget(db: Db, category: string, amount: number): Promise<Budget> {
  const { data, error } = await db.supabase
    .from('budgets')
    .upsert(
      { user_id: db.userId, category, amount, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,category' },
    )
    .select()
    .single();
  if (error) fallar('No se pudo guardar el presupuesto', error);
  return rowToBudget(data);
}

export async function deleteBudget(db: Db, id: string): Promise<boolean> {
  const { data, error } = await db.supabase
    .from('budgets').delete().eq('user_id', db.userId).eq('id', id).select('id');
  if (error) fallar('No se pudo eliminar el presupuesto', error);
  return (data ?? []).length > 0;
}

// ─── Gmail ────────────────────────────────────────────────────────────────────

function rowToEmailConnection(row: Record<string, unknown>): EmailConnection {
  return {
    id: row.id as string,
    email: row.email as string,
    access_token: row.access_token as string,
    refresh_token: (row.refresh_token as string) ?? null,
    token_expiry: row.token_expiry != null ? Number(row.token_expiry) : null,
    created_at: row.created_at as string,
  };
}

export async function getEmailConnection(db: Db): Promise<EmailConnection | null> {
  const { data, error } = await db.supabase
    .from('email_connections').select('*').eq('user_id', db.userId).maybeSingle();
  if (error) fallar('No se pudo leer la conexión de correo', error);
  return data ? rowToEmailConnection(data) : null;
}

export async function saveEmailConnection(
  db: Db,
  datos: Omit<EmailConnection, 'id' | 'created_at'>,
): Promise<EmailConnection> {
  const { data, error } = await db.supabase
    .from('email_connections')
    .upsert(
      {
        user_id: db.userId,
        email: datos.email,
        access_token: datos.access_token,
        refresh_token: datos.refresh_token ?? null,
        token_expiry: datos.token_expiry ?? null,
      },
      { onConflict: 'user_id' },
    )
    .select()
    .single();
  if (error) fallar('No se pudo guardar la conexión de correo', error);
  return rowToEmailConnection(data);
}

export async function updateEmailTokens(
  db: Db,
  id: string,
  accessToken: string,
  tokenExpiry: number | null,
): Promise<void> {
  const { error } = await db.supabase
    .from('email_connections')
    .update({ access_token: accessToken, token_expiry: tokenExpiry })
    .eq('user_id', db.userId)
    .eq('id', id);
  if (error) fallar('No se pudieron actualizar los tokens de correo', error);
}

export async function deleteEmailConnection(db: Db): Promise<void> {
  const { error } = await db.supabase
    .from('email_connections').delete().eq('user_id', db.userId);
  if (error) fallar('No se pudo desconectar el correo', error);
}
