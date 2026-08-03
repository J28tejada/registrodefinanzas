import { SupabaseClient } from '@supabase/supabase-js';
import {
  Budget,
  BudgetProgress,
  EmailConnection,
  Ledger,
  LedgerInvite,
  LedgerMember,
  LedgerRole,
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

/**
 * Las cuentas propias y aquellas donde el usuario fue invitado.
 *
 * No filtra por `user_id`: eso dejaría fuera las compartidas, donde el dueño es
 * otro. El recorte lo hace la membresía, que es lo que RLS también exige.
 */
export async function getAllLedgersWithStats(db: Db): Promise<LedgerWithStats[]> {
  const { data: misMembresias, error: memberError } = await db.supabase
    .from('ledger_members')
    .select('ledger_id, role')
    .eq('user_id', db.userId);
  if (memberError) fallar('No se pudieron leer las cuentas', memberError);

  const ids = (misMembresias ?? []).map(m => m.ledger_id as string);
  if (ids.length === 0) return [];

  const rolePorCuenta = new Map<string, LedgerRole>(
    (misMembresias ?? []).map(m => [m.ledger_id as string, (m.role as LedgerRole) ?? 'member']),
  );

  const [ledgersRes, statsRes, miembrosRes] = await Promise.all([
    db.supabase.from('ledgers').select('*').in('id', ids).order('created_at'),
    db.supabase.rpc('ledger_stats', { p_user: db.userId }),
    db.supabase.from('ledger_members').select('ledger_id').in('ledger_id', ids),
  ]);
  if (ledgersRes.error) fallar('No se pudieron leer las cuentas', ledgersRes.error);
  if (statsRes.error) fallar('No se pudieron calcular los totales de las cuentas', statsRes.error);
  if (miembrosRes.error) fallar('No se pudieron contar los miembros', miembrosRes.error);

  const stats = new Map<string, { tx_count: number; balance: number }>(
    ((statsRes.data ?? []) as Record<string, unknown>[]).map(r => [
      r.ledger_id as string,
      { tx_count: Number(r.tx_count ?? 0), balance: Number(r.balance ?? 0) },
    ]),
  );

  const conteo = new Map<string, number>();
  for (const fila of miembrosRes.data ?? []) {
    const id = fila.ledger_id as string;
    conteo.set(id, (conteo.get(id) ?? 0) + 1);
  }

  return (ledgersRes.data ?? []).map(row => ({
    ...rowToLedger(row),
    transactionCount: stats.get(row.id as string)?.tx_count ?? 0,
    balance: stats.get(row.id as string)?.balance ?? 0,
    role: rolePorCuenta.get(row.id as string) ?? 'member',
    memberCount: conteo.get(row.id as string) ?? 1,
  }));
}

export async function getLedgerById(db: Db, id: string): Promise<Ledger | null> {
  // Sin `.eq('user_id')`: eso escondería las cuentas compartidas, donde el dueño
  // es otro. El recorte lo hace la membresía, comprobada abajo.
  const { data, error } = await db.supabase
    .from('ledgers').select('*').eq('id', id).maybeSingle();
  if (error) fallar('No se pudo leer la cuenta', error);
  if (!data) return null;

  // Con la sesión del usuario RLS ya filtró, pero con la service role (el
  // webhook de WhatsApp) no filtra nada: sin este chequeo, un número vinculado
  // podría leer la cuenta de cualquiera pasando su id.
  if (data.user_id !== db.userId && !(await getLedgerRole(db, id))) return null;

  return rowToLedger(data);
}

/** El rol del usuario en la cuenta, o null si no tiene acceso. */
export async function getLedgerRole(db: Db, ledgerId: string): Promise<LedgerRole | null> {
  const { data, error } = await db.supabase
    .from('ledger_members')
    .select('role')
    .eq('ledger_id', ledgerId)
    .eq('user_id', db.userId)
    .maybeSingle();
  if (error) fallar('No se pudo verificar el acceso a la cuenta', error);
  return data ? ((data.role as LedgerRole) ?? 'member') : null;
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

  // Quien la crea queda como dueño. Sin esta fila la cuenta no aparecería:
  // el listado se arma desde las membresías, no desde `ledgers.user_id`.
  const { error: memberError } = await db.supabase
    .from('ledger_members')
    .insert({ ledger_id: data.id, user_id: db.userId, role: 'owner' });
  if (memberError) fallar('No se pudo registrar el dueño de la cuenta', memberError);

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
  if ((await getLedgerRole(db, id)) !== 'owner') {
    return { ok: false, error: 'Solo el dueño puede eliminar la cuenta.' };
  }

  // Sin filtrar por user_id: si la cuenta está compartida también cuentan los
  // movimientos de la otra persona, que se perderían al borrarla.
  const { count, error: countError } = await db.supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
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

// ─── Miembros e invitaciones ──────────────────────────────────────────────────

export async function getLedgerMembers(db: Db, ledgerId: string): Promise<LedgerMember[]> {
  const { data, error } = await db.supabase
    .from('ledger_members')
    .select('user_id, ledger_id, role, joined_at, profiles(email, display_name, avatar_url)')
    .eq('ledger_id', ledgerId)
    .order('joined_at');
  if (error) fallar('No se pudieron leer los miembros', error);

  return (data ?? []).map(fila => {
    const perfil = fila.profiles as unknown as
      { email?: string; display_name?: string; avatar_url?: string } | null;
    const email = perfil?.email ?? '';
    return {
      user_id: fila.user_id as string,
      ledger_id: fila.ledger_id as string,
      role: (fila.role as LedgerRole) ?? 'member',
      email,
      name: perfil?.display_name || email.split('@')[0] || 'Sin nombre',
      avatar_url: perfil?.avatar_url ?? null,
      joined_at: fila.joined_at as string,
    };
  }).sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));
}

/** Quita a alguien de la cuenta. Al dueño no se lo puede quitar. */
export async function removeLedgerMember(
  db: Db,
  ledgerId: string,
  targetUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const miRol = await getLedgerRole(db, ledgerId);
  if (!miRol) return { ok: false, error: 'Sin acceso a esta cuenta.' };

  const esSalidaPropia = targetUserId === db.userId;
  if (miRol !== 'owner' && !esSalidaPropia) {
    return { ok: false, error: 'Solo el dueño puede quitar a otros miembros.' };
  }

  const { data: objetivo, error: lookupError } = await db.supabase
    .from('ledger_members')
    .select('role')
    .eq('ledger_id', ledgerId)
    .eq('user_id', targetUserId)
    .maybeSingle();
  if (lookupError) fallar('No se pudo leer el miembro', lookupError);
  if (!objetivo) return { ok: false, error: 'Esa persona no está en la cuenta.' };
  if (objetivo.role === 'owner') {
    return { ok: false, error: 'No se puede quitar al dueño de la cuenta.' };
  }

  const { error } = await db.supabase
    .from('ledger_members').delete().eq('ledger_id', ledgerId).eq('user_id', targetUserId);
  if (error) fallar('No se pudo quitar al miembro', error);
  return { ok: true };
}

/** Sin 0/O ni 1/I: el código se dicta y se tipea a mano. */
const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generarCodigo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => ALFABETO_CODIGO[b % ALFABETO_CODIGO.length]).join('');
}

/**
 * Crea un código nuevo y borra los anteriores de esa cuenta: así un código que
 * se compartió de más deja de servir en cuanto se genera otro.
 */
export async function createInvite(db: Db, ledgerId: string): Promise<LedgerInvite | { error: string }> {
  if ((await getLedgerRole(db, ledgerId)) !== 'owner') {
    return { error: 'Solo el dueño puede invitar.' };
  }

  const cuenta = await getLedgerById(db, ledgerId);
  if (!cuenta) return { error: 'Cuenta no encontrada.' };

  const { error: delError } = await db.supabase
    .from('ledger_invites').delete().eq('ledger_id', ledgerId);
  if (delError) fallar('No se pudieron limpiar las invitaciones anteriores', delError);

  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const code = generarCodigo();

  const { error } = await db.supabase.from('ledger_invites').insert({
    code,
    ledger_id: ledgerId,
    created_by: db.userId,
    expires_at: expires,
  });
  if (error) fallar('No se pudo crear la invitación', error);

  return { code, ledger_id: ledgerId, ledger_name: cuenta.name, expires_at: expires };
}

/** A qué cuenta invita un código, sin unirse todavía. */
export async function peekInvite(
  db: Db,
  code: string,
): Promise<{ ledger_name: string; expires_at: string } | null> {
  const { data, error } = await db.supabase.rpc('ver_invitacion', { p_code: code });
  if (error) fallar('No se pudo leer la invitación', error);
  const fila = (data ?? [])[0] as { ledger_name: string; expires_at: string } | undefined;
  return fila ?? null;
}

export async function acceptInvite(
  db: Db,
  code: string,
): Promise<{ ok: true; ledger_id: string; ledger_name: string } | { ok: false; error: string }> {
  const { data, error } = await db.supabase.rpc('aceptar_invitacion', { p_code: code });
  if (error) {
    if (error.message.includes('CODIGO_INVALIDO')) return { ok: false, error: 'Código de invitación inválido.' };
    if (error.message.includes('CODIGO_EXPIRADO')) return { ok: false, error: 'Esta invitación ya expiró. Pedí una nueva.' };
    if (error.message.includes('NO_AUTENTICADO')) return { ok: false, error: 'Tenés que iniciar sesión.' };
    // Cualquier otra cosa es un error nuestro, no del código que ingresó. Sin
    // este log el motivo real queda invisible detrás del mensaje genérico:
    // así se escondió un 42702 por ambigüedad de columna en la función.
    console.error('[invites] fallo inesperado al aceptar:', error);
    return { ok: false, error: 'No se pudo aceptar la invitación.' };
  }
  const fila = (data ?? [])[0] as { ledger_id: string; ledger_name: string } | undefined;
  if (!fila) return { ok: false, error: 'Código de invitación inválido.' };
  return { ok: true, ledger_id: fila.ledger_id, ledger_name: fila.ledger_name };
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
    author_id: (row.user_id as string) ?? null,
    author_name: nombreDePerfil(row.profiles),
  };
}

/**
 * El nombre de quien registró, cuando la consulta trajo su perfil.
 *
 * PostgREST devuelve la relación como objeto o como lista de uno según cómo
 * infiera la cardinalidad, así que se contemplan las dos.
 */
function nombreDePerfil(rel: unknown): string | null {
  const perfil = (Array.isArray(rel) ? rel[0] : rel) as
    { preferred_name?: string; display_name?: string; email?: string } | null | undefined;
  if (!perfil) return null;
  return perfil.preferred_name
    || perfil.display_name
    || perfil.email?.split('@')[0]
    || null;
}

/** Ids de las cuentas donde el usuario es dueño o miembro. */
async function misCuentas(db: Db): Promise<string[]> {
  const { data, error } = await db.supabase
    .from('ledger_members').select('ledger_id').eq('user_id', db.userId);
  if (error) fallar('No se pudieron leer las cuentas del usuario', error);
  return (data ?? []).map(m => m.ledger_id as string);
}

export async function getAllTransactions(
  db: Db,
  filters?: TransactionFilters,
): Promise<Transaction[]> {
  let q = db.supabase.from('transactions').select('*');

  if (filters?.ledger_id) {
    // Pidió una cuenta puntual: alcanza con comprobar que tenga acceso.
    if (!(await getLedgerRole(db, filters.ledger_id))) return [];
    q = q.eq('ledger_id', filters.ledger_id);
  } else {
    // Vista global: lo propio más lo que cargaron otros en cuentas compartidas.
    // Sin esto, con la service role (que salta RLS) se verían movimientos ajenos.
    const cuentas = await misCuentas(db);
    q = cuentas.length > 0
      ? q.or(`user_id.eq.${db.userId},ledger_id.in.(${cuentas.join(',')})`)
      : q.eq('user_id', db.userId);
  }
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

  const movimientos = (data ?? []).map(rowToTransaction);
  await ponerleNombreAlAutor(db, movimientos);
  return movimientos;
}

/**
 * Completa `author_name` en una tanda de movimientos.
 *
 * Va en una consulta aparte y no como join porque `transactions.user_id`
 * referencia `auth.users`, no `profiles`: sin una FK entre esas dos tablas,
 * PostgREST no sabe relacionarlas. Una consulta por tanda, no por fila.
 */
async function ponerleNombreAlAutor(db: Db, movimientos: Transaction[]): Promise<void> {
  const ids = [...new Set(movimientos.map(m => m.author_id).filter(Boolean))] as string[];
  if (ids.length === 0) return;

  const { data, error } = await db.supabase
    .from('profiles').select('id, preferred_name, display_name, email').in('id', ids);
  // Quedarse sin el nombre no puede tumbar la lista de movimientos.
  if (error) return;

  const nombres = new Map<string, string | null>(
    (data ?? []).map(p => [p.id as string, nombreDePerfil(p)]),
  );
  for (const m of movimientos) {
    if (m.author_id) m.author_name = nombres.get(m.author_id) ?? null;
  }
}

/**
 * Un movimiento es alcanzable si es propio o si vive en una cuenta compartida
 * del usuario. Lo segundo es lo que permite corregir lo que cargó la pareja.
 */
async function puedeTocarMovimiento(db: Db, tx: Transaction | null): Promise<boolean> {
  if (!tx) return false;
  if (!tx.ledger_id) return true; // sin cuenta solo lo ve su dueño, y RLS ya filtró
  return (await getLedgerRole(db, tx.ledger_id)) !== null;
}

export async function getTransactionById(db: Db, id: string): Promise<Transaction | null> {
  const { data, error } = await db.supabase
    .from('transactions').select('*').eq('id', id).maybeSingle();
  if (error) fallar('No se pudo leer el movimiento', error);
  if (!data) return null;

  const tx = rowToTransaction(data);
  // Con la service role RLS no filtra: el chequeo de acceso va acá.
  if (data.user_id !== db.userId && !(await puedeTocarMovimiento(db, tx))) return null;
  return tx;
}

export async function createTransaction(
  db: Db,
  datos: Omit<Transaction, 'id' | 'createdAt'>,
): Promise<Transaction> {
  // Con la service role RLS no valida nada: sin esto, el webhook podría anotar
  // un gasto en la cuenta de otra persona.
  if (datos.ledger_id && !(await getLedgerRole(db, datos.ledger_id))) {
    throw new Error('No tenés acceso a esa cuenta');
  }

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

  // getTransactionById ya valida el acceso, incluso con la service role.
  const actual = await getTransactionById(db, id);
  if (!actual) return null;

  // Mover un movimiento a otra cuenta exige acceso también al destino.
  if (datos.ledger_id !== undefined && datos.ledger_id !== null) {
    if (!(await getLedgerRole(db, datos.ledger_id))) return null;
  }

  const { data, error } = await db.supabase
    .from('transactions').update(campos).eq('id', id).select().maybeSingle();
  if (error) fallar('No se pudo actualizar el movimiento', error);
  return data ? rowToTransaction(data) : null;
}

export async function deleteTransaction(db: Db, id: string): Promise<boolean> {
  // Valida el acceso antes de borrar: propio, o de una cuenta compartida.
  if (!(await getTransactionById(db, id))) return false;

  const { data, error } = await db.supabase
    .from('transactions').delete().eq('id', id).select('id');
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
