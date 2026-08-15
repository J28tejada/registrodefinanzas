import { SupabaseClient } from '@supabase/supabase-js';
import {
  Budget,
  BudgetProgress,
  Card,
  CardDetail,
  CardMonth,
  CardWithUsage,
  Category,
  CategoryWithUsage,
  Debt,
  DebtPayment,
  DebtProgress,
  EmailConnection,
  Ledger,
  LedgerInvite,
  LedgerMember,
  LedgerRole,
  LedgerWithStats,
  ShoppingItem,
  ShoppingList,
  ShoppingListDetail,
  ShoppingListWithTotals,
  ShoppingTrip,
  ShoppingTripDetail,
  ShoppingTripItem,
  ShoppingTripWithTotals,
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

/**
 * ¿Este error es "esa columna no existe todavía"?
 *
 * Vercel despliega apenas se hace push, pero las migraciones las corre una
 * persona a mano y más tarde. En esa ventana el código nuevo le escribe a una
 * columna que aún no está, y lo que se rompe no es la función nueva sino
 * registrar un gasto: lo más usado de la app. Detectarlo permite reintentar sin
 * ese campo en vez de dejar al usuario sin poder anotar nada.
 *
 * PGRST204 es PostgREST ("no encuentro la columna en el cache de esquema") y
 * 42703 es Postgres (undefined_column).
 */
function faltaLaColumna(error: { code?: string; message?: string } | null, columna: string): boolean {
  if (!error) return false;
  const esFaltante = error.code === 'PGRST204' || error.code === '42703';
  return esFaltante && (error.message ?? '').includes(columna);
}

/**
 * Recorta una consulta a lo que el usuario puede ver: suyo, o de una cuenta que
 * comparte. Es el equivalente en código de la política de RLS.
 *
 * Hace falta porque el webhook de WhatsApp usa la service role, que NO pasa por
 * RLS: ahí, una consulta sin filtro devuelve las filas de todos los usuarios.
 *
 * No es `async` a propósito. El builder de PostgREST es "thenable", así que
 * devolverlo desde una función asíncrona lo ejecuta al resolverse y lo que
 * vuelve es el resultado, no la consulta para seguir encadenando.
 */
/** ¿Esta fila es del usuario o de una cuenta que comparte? */
async function puedoVer(db: Db, fila: { user_id?: unknown; ledger_id?: unknown }): Promise<boolean> {
  if (fila.user_id === db.userId) return true;
  if (!fila.ledger_id) return false;
  return (await misCuentas(db)).includes(fila.ledger_id as string);
}

/**
 * ¿El usuario puede tocar la fila hija? Se decide por su padre, que es quien
 * tiene dueño y cuenta. Devuelve false en vez de lanzar para que la ruta
 * responda 404 y no filtre si el id existe.
 */
async function padreVisible(
  db: Db,
  tabla: string,
  columnaPadre: string,
  id: string,
  cargarPadre: (db: Db, id: string) => Promise<unknown | null>,
): Promise<boolean> {
  const { data } = await db.supabase.from(tabla).select(columnaPadre).eq('id', id).maybeSingle();
  const padre = (data as Record<string, unknown> | null)?.[columnaPadre] as string | undefined;
  return padre ? (await cargarPadre(db, padre)) !== null : false;
}

/** Lo mismo para un presupuesto, que no tiene padre pero sí dueño y cuenta. */
async function budgetVisible(db: Db, id: string): Promise<boolean> {
  const { data } = await db.supabase
    .from('budgets').select('user_id, ledger_id').eq('id', id).maybeSingle();
  return data ? puedoVer(db, data) : false;
}

function soloVisibles<T extends {
  or(f: string): T;
  eq(c: string, v: string): T;
}>(q: T, userId: string, cuentas: string[]): T {
  return cuentas.length === 0
    ? q.eq('user_id', userId)
    : q.or(`user_id.eq.${userId},ledger_id.in.(${cuentas.join(',')})`);
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
    card_id: (row.card_id as string) ?? null,
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
  if (filters?.card_id) q = q.eq('card_id', filters.card_id);
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

  const fila: Record<string, unknown> = {
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
    card_id: datos.card_id ?? null,
  };

  let { data, error } = await db.supabase.from('transactions').insert(fila).select().single();

  // Sin la migración de tarjetas corrida, `card_id` no existe. Anotar el gasto
  // importa mucho más que enlazarlo con la tarjeta: se guarda igual, y el medio
  // de pago queda en `payment_method`, que sí está desde el principio.
  if (faltaLaColumna(error, 'card_id')) {
    delete fila.card_id;
    ({ data, error } = await db.supabase.from('transactions').insert(fila).select().single());
  }

  if (error) fallar('No se pudo guardar el movimiento', error);
  return rowToTransaction(data);
}

export async function updateTransaction(
  db: Db,
  id: string,
  datos: Partial<Omit<Transaction, 'id' | 'createdAt'>>,
): Promise<Transaction | null> {
  const campos: Record<string, unknown> = {};
  for (const clave of ['ledger_id', 'type', 'scope', 'amount', 'category', 'description', 'date', 'source', 'receipt_url', 'payment_method', 'card_id'] as const) {
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

// ─── Categorías ───────────────────────────────────────────────────────────────

function rowToCategory(row: Record<string, unknown>): Category {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as Category['type'],
    scope: row.scope as Category['scope'],
    created_at: row.created_at as string,
  };
}

/** Las categorías del usuario, opcionalmente filtradas por tipo y ámbito. */
export async function getCategories(
  db: Db,
  filtros?: { type?: Category['type']; scope?: Category['scope'] },
): Promise<Category[]> {
  let q = db.supabase.from('categories').select('*').eq('user_id', db.userId);
  if (filtros?.type) q = q.eq('type', filtros.type);
  if (filtros?.scope) q = q.eq('scope', filtros.scope);

  const { data, error } = await q.order('name');
  if (error) fallar('No se pudieron leer las categorías', error);
  return (data ?? []).map(rowToCategory);
}

/** Igual, pero contando en cuántos movimientos se usa cada una. */
export async function getCategoriesWithUsage(db: Db): Promise<CategoryWithUsage[]> {
  const [cats, movs] = await Promise.all([
    getCategories(db),
    db.supabase.from('transactions').select('category, type, scope').eq('user_id', db.userId),
  ]);
  if (movs.error) fallar('No se pudieron contar los usos', movs.error);

  const clave = (c: { category?: string; name?: string; type: string; scope: string }) =>
    `${c.type}|${c.scope}|${(c.category ?? c.name ?? '').toLowerCase()}`;

  const conteo = new Map<string, number>();
  for (const m of movs.data ?? []) {
    const k = clave(m as { category: string; type: string; scope: string });
    conteo.set(k, (conteo.get(k) ?? 0) + 1);
  }

  return cats.map(c => ({ ...c, usos: conteo.get(clave(c)) ?? 0 }));
}

export async function createCategory(
  db: Db,
  datos: { name: string; type: Category['type']; scope: Category['scope'] },
): Promise<Category | { error: string }> {
  const name = datos.name.trim();
  if (!name) return { error: 'El nombre no puede estar vacío.' };
  if (name.length > 40) return { error: 'El nombre es demasiado largo.' };

  const { data, error } = await db.supabase
    .from('categories')
    .insert({ user_id: db.userId, name, type: datos.type, scope: datos.scope })
    .select()
    .single();

  // 23505: ya existe una igual. Es lo esperable, no un fallo del sistema.
  if (error?.code === '23505') return { error: 'Ya tenés una categoría con ese nombre.' };
  if (error) fallar('No se pudo crear la categoría', error);
  return rowToCategory(data);
}

/**
 * Renombra y arrastra lo que ya estaba anotado con el nombre viejo.
 *
 * `transactions.category` guarda el texto, no una referencia. Si solo se
 * cambiara la fila de `categories`, los movimientos anteriores quedarían con un
 * nombre que ya no existe: desaparecerían de los totales por categoría y de su
 * presupuesto, sin que nada avise.
 */
export async function renameCategory(
  db: Db,
  id: string,
  nuevoNombre: string,
): Promise<Category | { error: string }> {
  const name = nuevoNombre.trim();
  if (!name) return { error: 'El nombre no puede estar vacío.' };
  if (name.length > 40) return { error: 'El nombre es demasiado largo.' };

  const { data: actual, error: errLeer } = await db.supabase
    .from('categories').select('*').eq('user_id', db.userId).eq('id', id).maybeSingle();
  if (errLeer) fallar('No se pudo leer la categoría', errLeer);
  if (!actual) return { error: 'Esa categoría no existe.' };

  const anterior = actual.name as string;
  if (anterior === name) return rowToCategory(actual);

  const { data, error } = await db.supabase
    .from('categories').update({ name }).eq('user_id', db.userId).eq('id', id).select().single();
  if (error?.code === '23505') return { error: 'Ya tenés una categoría con ese nombre.' };
  if (error) fallar('No se pudo renombrar la categoría', error);

  // El arrastre va después de que el renombre salió bien: si fallara antes,
  // quedarían movimientos apuntando a un nombre que no llegó a existir.
  const { error: errMovs } = await db.supabase
    .from('transactions')
    .update({ category: name })
    .eq('user_id', db.userId)
    .eq('category', anterior)
    .eq('type', actual.type)
    .eq('scope', actual.scope);
  if (errMovs) fallar('Se renombró la categoría pero no sus movimientos', errMovs);

  // Los presupuestos también la referencian por nombre.
  const { error: errPres } = await db.supabase
    .from('budgets').update({ category: name }).eq('user_id', db.userId).eq('category', anterior);
  if (errPres) fallar('Se renombró la categoría pero no su presupuesto', errPres);

  return rowToCategory(data);
}

/**
 * Borra una categoría que no esté en uso.
 *
 * Con movimientos anotados no se borra: quedarían con un nombre huérfano y sin
 * forma de volver a elegirlo. Renombrarla sí se puede siempre.
 */
export async function deleteCategory(db: Db, id: string): Promise<{ ok: boolean; error?: string }> {
  const { data: actual, error: errLeer } = await db.supabase
    .from('categories').select('*').eq('user_id', db.userId).eq('id', id).maybeSingle();
  if (errLeer) fallar('No se pudo leer la categoría', errLeer);
  if (!actual) return { ok: false, error: 'Esa categoría no existe.' };

  const { count, error: errUso } = await db.supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', db.userId)
    .eq('category', actual.name as string)
    .eq('type', actual.type as string)
    .eq('scope', actual.scope as string);
  if (errUso) fallar('No se pudo verificar el uso de la categoría', errUso);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `La usan ${count} movimiento${count === 1 ? '' : 's'}. Podés renombrarla, pero no borrarla.`,
    };
  }

  await db.supabase.from('budgets').delete().eq('user_id', db.userId).eq('category', actual.name as string);
  const { error } = await db.supabase
    .from('categories').delete().eq('user_id', db.userId).eq('id', id);
  if (error) fallar('No se pudo eliminar la categoría', error);
  return { ok: true };
}

// ─── Deudas ───────────────────────────────────────────────────────────────────

function rowToDebt(row: Record<string, unknown>): Debt {
  return {
    id: row.id as string,
    ledger_id: (row.ledger_id as string) ?? null,
    name: row.name as string,
    creditor: (row.creditor as string) ?? '',
    total_amount: Number(row.total_amount),
    installment_amount: Number(row.installment_amount),
    installments: Number(row.installments),
    start_date: row.start_date as string,
    category: row.category as string,
    archived: Boolean(row.archived),
    notes: (row.notes as string) ?? '',
    created_at: row.created_at as string,
  };
}

/**
 * Las deudas con sus números al día, para el mes que se pida.
 *
 * Todo se deriva de lo pagado y nada de cuotas tildadas: si un mes se pagó de
 * más, ese excedente adelanta la cuota siguiente sin que haya que tocar nada.
 */
export async function getDebtsProgress(
  db: Db,
  startDate: string,
  endDate: string,
  opciones?: { incluirArchivadas?: boolean },
): Promise<DebtProgress[]> {
  const [deudasRes, progresoRes] = await Promise.all([
    db.supabase.from('debts').select('*').eq('user_id', db.userId).order('created_at'),
    db.supabase.rpc('debt_progress', { p_user: db.userId, p_start: startDate, p_end: endDate }),
  ]);
  if (deudasRes.error) fallar('No se pudieron leer las deudas', deudasRes.error);
  if (progresoRes.error) fallar('No se pudo calcular el avance de las deudas', progresoRes.error);

  const pagos = new Map<string, { total: number; periodo: number }>(
    ((progresoRes.data ?? []) as Record<string, unknown>[]).map(r => [
      r.debt_id as string,
      { total: Number(r.paid_total ?? 0), periodo: Number(r.paid_period ?? 0) },
    ]),
  );

  return (deudasRes.data ?? [])
    .map(rowToDebt)
    .filter(d => opciones?.incluirArchivadas || !d.archived)
    .map(d => {
      const p = pagos.get(d.id) ?? { total: 0, periodo: 0 };
      // Pagar de más no debe mostrar 120% ni un restante negativo.
      const paid = Math.min(p.total, d.total_amount);
      const remaining = Math.max(d.total_amount - p.total, 0);
      const dueThisMonth = Math.max(d.installment_amount - p.periodo, 0);

      return {
        ...d,
        paid: p.total,
        remaining,
        percent: d.total_amount > 0 ? Math.round((paid / d.total_amount) * 100) : 0,
        installmentsPaid: d.installment_amount > 0
          ? Math.min(p.total / d.installment_amount, d.installments)
          : 0,
        paidThisMonth: p.periodo,
        dueThisMonth,
        monthPercent: d.installment_amount > 0
          ? Math.min(Math.round((p.periodo / d.installment_amount) * 100), 100)
          : 0,
        monthCovered: p.periodo >= d.installment_amount,
        settled: remaining <= 0,
      };
    });
}

export async function getDebtById(db: Db, id: string): Promise<Debt | null> {
  const { data, error } = await db.supabase
    .from('debts').select('*').eq('user_id', db.userId).eq('id', id).maybeSingle();
  if (error) fallar('No se pudo leer la deuda', error);
  return data ? rowToDebt(data) : null;
}

export async function createDebt(
  db: Db,
  datos: Omit<Debt, 'id' | 'created_at' | 'archived'>,
): Promise<Debt> {
  const { data, error } = await db.supabase
    .from('debts')
    .insert({
      user_id: db.userId,
      ledger_id: datos.ledger_id ?? null,
      name: datos.name,
      creditor: datos.creditor ?? '',
      total_amount: datos.total_amount,
      installment_amount: datos.installment_amount,
      installments: datos.installments,
      start_date: datos.start_date,
      category: datos.category,
      notes: datos.notes ?? '',
    })
    .select()
    .single();
  if (error) fallar('No se pudo crear la deuda', error);
  return rowToDebt(data);
}

export async function updateDebt(
  db: Db,
  id: string,
  datos: Partial<Omit<Debt, 'id' | 'created_at'>>,
): Promise<Debt | null> {
  const campos: Record<string, unknown> = {};
  for (const c of ['ledger_id', 'name', 'creditor', 'total_amount', 'installment_amount',
                   'installments', 'start_date', 'category', 'archived', 'notes'] as const) {
    if (datos[c] !== undefined) campos[c] = datos[c];
  }
  if (Object.keys(campos).length === 0) return getDebtById(db, id);

  const { data, error } = await db.supabase
    .from('debts').update(campos).eq('user_id', db.userId).eq('id', id).select().maybeSingle();
  if (error) fallar('No se pudo actualizar la deuda', error);
  return data ? rowToDebt(data) : null;
}

export async function deleteDebt(db: Db, id: string): Promise<boolean> {
  // Los pagos se van con ella por la FK, pero los movimientos que generaron
  // quedan: son gastos que de verdad ocurrieron.
  const { data, error } = await db.supabase
    .from('debts').delete().eq('user_id', db.userId).eq('id', id).select('id');
  if (error) fallar('No se pudo eliminar la deuda', error);
  return (data ?? []).length > 0;
}

export async function getDebtPayments(db: Db, debtId: string): Promise<DebtPayment[]> {
  const { data, error } = await db.supabase
    .from('debt_payments').select('*')
    .eq('user_id', db.userId).eq('debt_id', debtId)
    .order('date', { ascending: false });
  if (error) fallar('No se pudieron leer los pagos', error);
  return (data ?? []).map(r => ({
    id: r.id as string,
    debt_id: r.debt_id as string,
    amount: Number(r.amount),
    date: r.date as string,
    transaction_id: (r.transaction_id as string) ?? null,
    created_at: r.created_at as string,
  }));
}

/**
 * Registra un pago y, con él, el gasto correspondiente.
 *
 * Las dos cosas juntas y no por separado: si el pago viviera solo en la deuda,
 * el dinero saldría del bolsillo sin aparecer en los movimientos ni en el
 * presupuesto. Y si hubiera que anotarlo dos veces, tarde o temprano una de las
 * dos falta.
 */
export async function registrarPagoDeuda(
  db: Db,
  debtId: string,
  datos: { amount: number; date: string; ledger_id?: string | null },
): Promise<{ ok: true; pago: DebtPayment } | { ok: false; error: string }> {
  const deuda = await getDebtById(db, debtId);
  if (!deuda) return { ok: false, error: 'Esa deuda no existe.' };
  if (!(datos.amount > 0)) return { ok: false, error: 'El monto tiene que ser mayor que cero.' };

  const ledgerId = datos.ledger_id ?? deuda.ledger_id;
  if (!ledgerId) return { ok: false, error: 'Elegí en qué cuenta registrar el pago.' };

  const rol = await getLedgerRole(db, ledgerId);
  if (!rol) return { ok: false, error: 'No tenés acceso a esa cuenta.' };

  const cuenta = await getLedgerById(db, ledgerId);

  const movimiento = await createTransaction(db, {
    ledger_id: ledgerId,
    type: 'expense',
    scope: cuenta?.type ?? 'personal',
    amount: datos.amount,
    category: deuda.category,
    description: `Cuota de ${deuda.name}`,
    date: datos.date,
    source: 'manual',
    receipt_url: null,
    payment_method: null,
  });

  const { data, error } = await db.supabase
    .from('debt_payments')
    .insert({
      debt_id: debtId,
      user_id: db.userId,
      amount: datos.amount,
      date: datos.date,
      transaction_id: movimiento.id,
    })
    .select()
    .single();
  if (error) fallar('Se registró el gasto pero no el pago de la deuda', error);

  return {
    ok: true,
    pago: {
      id: data.id as string,
      debt_id: debtId,
      amount: Number(data.amount),
      date: data.date as string,
      transaction_id: movimiento.id,
      created_at: data.created_at as string,
    },
  };
}

/** Borra el pago y el gasto que había generado: si no, quedaría duplicado. */
export async function borrarPagoDeuda(db: Db, pagoId: string): Promise<boolean> {
  const { data, error } = await db.supabase
    .from('debt_payments').select('*').eq('user_id', db.userId).eq('id', pagoId).maybeSingle();
  if (error) fallar('No se pudo leer el pago', error);
  if (!data) return false;

  if (data.transaction_id) {
    await deleteTransaction(db, data.transaction_id as string);
  }
  const { error: errBorrar } = await db.supabase
    .from('debt_payments').delete().eq('user_id', db.userId).eq('id', pagoId);
  if (errBorrar) fallar('No se pudo eliminar el pago', errBorrar);
  return true;
}

// ─── Presupuestos ─────────────────────────────────────────────────────────────

function rowToBudget(row: Record<string, unknown>): Budget {
  return {
    id: row.id as string,
    ledger_id: (row.ledger_id as string) ?? null,
    category: row.category as string,
    amount: Number(row.amount),
    created_at: row.created_at as string,
  };
}

/**
 * Los topes visibles. Con `ledgerId` se limita a los de esa cuenta; sin él
 * vienen todos, incluidos los globales.
 *
 * RLS ya deja pasar los de las cuentas compartidas, así que no se filtra por
 * `user_id`: el tope del hogar lo puso uno de los dos y lo ven ambos.
 */
export async function getBudgets(db: Db, ledgerId?: string | null): Promise<Budget[]> {
  let q = db.supabase.from('budgets').select('*').order('category');
  if (ledgerId !== undefined) {
    q = ledgerId === null ? q.is('ledger_id', null) : q.eq('ledger_id', ledgerId);
  }
  // El recorte va acá y no solo en RLS: `getBudgetProgress` lo llama el agente
  // de WhatsApp, que corre con la service role y ve la tabla entera.
  q = soloVisibles(q, db.userId, await misCuentas(db));
  const { data, error } = await q;
  if (error) fallar('No se pudieron leer los presupuestos', error);
  return (data ?? []).map(rowToBudget);
}

/**
 * Presupuestos con lo gastado en el período, listo para pintar la barra.
 *
 * Conviven dos clases de tope y no se miden igual: el de una cuenta se compara
 * contra lo que gastaron todos sus miembros ahí —el gasto del hogar lo hacen
 * los dos—, y el global contra lo que gastó uno solo en todas sus cuentas.
 */
export async function getBudgetProgress(
  db: Db,
  startDate: string,
  endDate: string,
  ledgerId?: string | null,
): Promise<BudgetProgress[]> {
  const [budgets, gastoRes] = await Promise.all([
    getBudgets(db, ledgerId),
    db.supabase.rpc('spent_by_category', { p_user: db.userId, p_start: startDate, p_end: endDate }),
  ]);
  if (gastoRes.error) fallar('No se pudo calcular lo gastado', gastoRes.error);

  const filas = (gastoRes.data ?? []) as Record<string, unknown>[];

  // Solo los nombres de las cuentas que aparecen: pedir todas para etiquetar
  // dos filas sería traer de más.
  const idsCuentas = [...new Set(budgets.map(b => b.ledger_id).filter(Boolean))] as string[];
  const nombres = new Map<string, string>();
  if (idsCuentas.length > 0) {
    const { data } = await db.supabase.from('ledgers').select('id, name').in('id', idsCuentas);
    for (const c of data ?? []) nombres.set(c.id as string, c.name as string);
  }

  // Por cuenta+categoría para los topes de una cuenta; por categoría, sumando
  // solo lo propio, para los globales.
  const porCuenta = new Map<string, number>();
  const propioPorCategoria = new Map<string, number>();
  for (const f of filas) {
    const categoria = f.category as string;
    const cuenta = (f.ledger_id as string) ?? '';
    porCuenta.set(`${cuenta}|${categoria}`, Number(f.spent_all ?? 0));
    propioPorCategoria.set(
      categoria,
      (propioPorCategoria.get(categoria) ?? 0) + Number(f.spent_mine ?? 0),
    );
  }

  return budgets.map(b => {
    const spent = b.ledger_id
      ? porCuenta.get(`${b.ledger_id}|${b.category}`) ?? 0
      : propioPorCategoria.get(b.category) ?? 0;
    return {
      ...b,
      spent,
      remaining: b.amount - spent,
      percent: b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0,
      ledger_name: b.ledger_id ? nombres.get(b.ledger_id) ?? null : null,
      compartido: b.ledger_id !== null,
    };
  });
}

export async function upsertBudget(
  db: Db,
  category: string,
  amount: number,
  ledgerId: string | null = null,
): Promise<Budget> {
  // Dos índices únicos distintos según haya cuenta o no, así que el upsert
  // tiene que apuntar al que corresponde.
  const fila = { user_id: db.userId, ledger_id: ledgerId, category, amount, updated_at: new Date().toISOString() };

  let { data, error } = await db.supabase
    .from('budgets')
    .upsert(fila, { onConflict: ledgerId ? 'ledger_id,category' : 'user_id,category' })
    .select()
    .single();

  // Sin la migración corrida no hay `ledger_id` ni su índice único: el tope se
  // guarda como global, que es exactamente lo que era antes. Mejor eso que no
  // poder crear un presupuesto.
  if (faltaLaColumna(error, 'ledger_id')) {
    const { ledger_id: _descartado, ...sinCuenta } = fila;
    ({ data, error } = await db.supabase
      .from('budgets')
      .upsert(sinCuenta, { onConflict: 'user_id,category' })
      .select()
      .single());
  }

  if (error) fallar('No se pudo guardar el presupuesto', error);
  return rowToBudget(data);
}

/**
 * Cambia el monto de un tope, la cuenta a la que pertenece, o las dos cosas.
 *
 * La categoría no se toca: cambiarla es en realidad otro tope, y sale más
 * claro borrando este y creando el que corresponde.
 */
export async function updateBudget(
  db: Db,
  id: string,
  cambios: { amount?: number; ledger_id?: string | null },
): Promise<{ ok: true; budget: Budget } | { ok: false; error: string }> {
  const campos: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (cambios.amount !== undefined) campos.amount = cambios.amount;
  if (cambios.ledger_id !== undefined) {
    if (cambios.ledger_id && !(await getLedgerRole(db, cambios.ledger_id))) {
      return { ok: false, error: 'No tenés acceso a esa cuenta.' };
    }
    campos.ledger_id = cambios.ledger_id;
  }

  // Igual que arriba: sin RLS, `.eq('id')` a secas alcanza cualquier fila.
  if (!(await budgetVisible(db, id))) return { ok: false, error: 'Ese presupuesto no existe.' };

  const { data, error } = await db.supabase
    .from('budgets')
    .update(campos)
    .eq('id', id)
    .select()
    .maybeSingle();

  // Ya hay un tope de esa categoría en el destino. Decirlo con nombre y
  // apellido, en vez del error de índice único de Postgres.
  if (error?.code === '23505') {
    return {
      ok: false,
      error: cambios.ledger_id
        ? 'Esa cuenta ya tiene un presupuesto para esta categoría. Borrá uno de los dos.'
        : 'Ya tenés un presupuesto sin cuenta para esta categoría. Borrá uno de los dos.',
    };
  }
  if (error) fallar('No se pudo actualizar el presupuesto', error);
  if (!data) return { ok: false, error: 'Ese presupuesto no existe.' };
  return { ok: true, budget: rowToBudget(data) };
}

export async function deleteBudget(db: Db, id: string): Promise<boolean> {
  // Sin filtrar por `user_id`: en una cuenta compartida el tope es del hogar y
  // cualquiera de los dos puede sacarlo. Pero el recorte tiene que estar igual,
  // porque con la service role RLS no interviene.
  if (!(await budgetVisible(db, id))) return false;

  const { data, error } = await db.supabase
    .from('budgets').delete().eq('id', id).select('id');
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

// ─── Tarjetas y medios de pago ────────────────────────────────────────────────

function rowToCard(row: Record<string, unknown>): Card {
  return {
    id: row.id as string,
    name: row.name as string,
    kind: row.kind as Card['kind'],
    last4: (row.last4 as string) ?? '',
    issuer: (row.issuer as string) ?? '',
    color: (row.color as Card['color']) ?? 'blue',
    archived: Boolean(row.archived),
    created_at: row.created_at as string,
  };
}

export async function getCards(db: Db, incluirArchivadas = false): Promise<Card[]> {
  let q = db.supabase.from('cards').select('*').eq('user_id', db.userId).order('name');
  if (!incluirArchivadas) q = q.eq('archived', false);
  const { data, error } = await q;
  if (error) fallar('No se pudieron leer las tarjetas', error);
  return (data ?? []).map(rowToCard);
}

/**
 * Las tarjetas con su uso y el gasto del período.
 *
 * El uso decide si borrarla se puede; el gasto es lo que se viene a ver. Los dos
 * salen de una consulta cada uno en vez de una por tarjeta.
 */
export async function getCardsWithUsage(
  db: Db,
  startDate: string,
  endDate: string,
  incluirArchivadas = false,
): Promise<CardWithUsage[]> {
  const [cards, gastoRes, usosRes] = await Promise.all([
    getCards(db, incluirArchivadas),
    db.supabase.rpc('spent_by_card', { p_user: db.userId, p_start: startDate, p_end: endDate }),
    db.supabase.from('transactions').select('card_id').eq('user_id', db.userId).not('card_id', 'is', null),
  ]);
  if (gastoRes.error) fallar('No se pudo calcular el gasto por tarjeta', gastoRes.error);
  if (usosRes.error) fallar('No se pudo contar el uso de las tarjetas', usosRes.error);

  const gasto = new Map<string, number>(
    ((gastoRes.data ?? []) as Record<string, unknown>[])
      .map(r => [r.card_id as string, Number(r.spent ?? 0)]),
  );
  const usos = new Map<string, number>();
  for (const fila of usosRes.data ?? []) {
    const id = fila.card_id as string;
    usos.set(id, (usos.get(id) ?? 0) + 1);
  }

  return cards.map(c => ({
    ...c,
    usos: usos.get(c.id) ?? 0,
    gastoDelMes: gasto.get(c.id) ?? 0,
  }));
}

/** Cuántos meses de historia acompañan al detalle de una tarjeta. */
const MESES_DE_SERIE = 6;

/** El primer día del mes que está `delta` meses de `iso`. */
function mesCorrido(iso: string, delta: number): string {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * El detalle de una tarjeta para un período: lo de esos días, lo de siempre y
 * la serie de los últimos meses.
 *
 * La serie termina en el período pedido y no en el mes actual: mirando un mes
 * viejo, la tendencia que importa es la de ese momento.
 *
 * Las filas de la serie se piden una sola vez y de ahí sale también el gasto
 * del período y su reparto por categoría, porque el período es el último tramo
 * de esa misma ventana. Una consulta en lugar de tres.
 */
export async function getCardDetail(
  db: Db,
  id: string,
  startDate: string,
  endDate: string,
): Promise<CardDetail | null> {
  const card = await getCardById(db, id);
  if (!card) return null;

  const desdeSerie = mesCorrido(startDate, -(MESES_DE_SERIE - 1));

  const [filasRes, historicoRes, usosRes] = await Promise.all([
    db.supabase
      .from('transactions')
      .select('date, amount, category')
      .eq('user_id', db.userId)
      .eq('card_id', id)
      .eq('type', 'expense')
      .gte('date', desdeSerie)
      .lte('date', endDate),
    // Rango abierto a propósito: es el total de siempre, y la función de gasto
    // por tarjeta ya existe. Ver `spent_by_card` en 0012_tarjetas.sql.
    db.supabase.rpc('spent_by_card', {
      p_user: db.userId, p_start: '1900-01-01', p_end: '2999-12-31',
    }),
    // Sin filtrar por tipo, igual que el uso que mira `deleteCard`: lo que
    // decide si se puede borrar es cuántos movimientos quedarían sin enlace.
    db.supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', db.userId)
      .eq('card_id', id),
  ]);
  if (filasRes.error) fallar('No se pudieron leer los movimientos de la tarjeta', filasRes.error);
  if (historicoRes.error) fallar('No se pudo calcular el gasto de la tarjeta', historicoRes.error);
  if (usosRes.error) fallar('No se pudo contar el uso de la tarjeta', usosRes.error);

  const filas = (filasRes.data ?? []) as { date: string; amount: number; category: string }[];

  // Los meses se arman vacíos y después se llenan: un mes sin gastos tiene que
  // aparecer en la serie como cero, no faltar y desplazar a los demás.
  const meses = new Map<string, CardMonth>();
  for (let i = MESES_DE_SERIE - 1; i >= 0; i--) {
    const month = mesCorrido(startDate, -i).slice(0, 7);
    meses.set(month, { month, total: 0, count: 0 });
  }

  const categorias = new Map<string, { category: string; total: number; count: number }>();
  let spent = 0;
  let count = 0;

  for (const fila of filas) {
    const monto = Number(fila.amount ?? 0);

    const mes = meses.get(fila.date.slice(0, 7));
    if (mes) { mes.total += monto; mes.count += 1; }

    if (fila.date < startDate) continue;
    spent += monto;
    count += 1;
    const acumulada = categorias.get(fila.category);
    if (acumulada) { acumulada.total += monto; acumulada.count += 1; }
    else categorias.set(fila.category, { category: fila.category, total: monto, count: 1 });
  }

  const historico = ((historicoRes.data ?? []) as Record<string, unknown>[])
    .find(r => r.card_id === id);

  return {
    card,
    spent,
    count,
    average: count > 0 ? spent / count : 0,
    spentAllTime: Number(historico?.spent ?? 0),
    countAllTime: usosRes.count ?? 0,
    byCategory: [...categorias.values()].sort((a, b) => b.total - a.total),
    monthly: [...meses.values()],
  };
}

export async function createCard(
  db: Db,
  datos: Omit<Card, 'id' | 'created_at' | 'archived'>,
): Promise<{ ok: true; card: Card } | { ok: false; error: string }> {
  const { data, error } = await db.supabase
    .from('cards')
    .insert({
      user_id: db.userId,
      name: datos.name,
      kind: datos.kind,
      last4: datos.last4 ?? '',
      issuer: datos.issuer ?? '',
      color: datos.color ?? 'blue',
    })
    .select()
    .single();
  if (error?.code === '23505') {
    return { ok: false, error: 'Ya tenés una con ese nombre.' };
  }
  if (error) fallar('No se pudo crear la tarjeta', error);
  return { ok: true, card: rowToCard(data) };
}

/**
 * Renombrar propaga el nombre a los movimientos, igual que en categorías.
 *
 * `transactions.payment_method` es texto y sigue existiendo para que un
 * movimiento sobreviva a que borren su tarjeta; si no se propaga, la lista
 * seguiría mostrando el nombre viejo al lado del nuevo.
 */
export async function updateCard(
  db: Db,
  id: string,
  cambios: Partial<Omit<Card, 'id' | 'created_at'>>,
): Promise<{ ok: true; card: Card } | { ok: false; error: string }> {
  const anterior = await getCardById(db, id);
  if (!anterior) return { ok: false, error: 'Esa tarjeta no existe.' };

  const campos: Record<string, unknown> = {};
  for (const clave of ['name', 'kind', 'last4', 'issuer', 'color', 'archived'] as const) {
    if (cambios[clave] !== undefined) campos[clave] = cambios[clave];
  }

  const { data, error } = await db.supabase
    .from('cards').update(campos).eq('user_id', db.userId).eq('id', id).select().maybeSingle();
  if (error?.code === '23505') return { ok: false, error: 'Ya tenés una con ese nombre.' };
  if (error) fallar('No se pudo actualizar la tarjeta', error);
  if (!data) return { ok: false, error: 'Esa tarjeta no existe.' };

  if (cambios.name !== undefined && cambios.name !== anterior.name) {
    const { error: errProp } = await db.supabase
      .from('transactions')
      .update({ payment_method: cambios.name })
      .eq('user_id', db.userId)
      .eq('card_id', id);
    if (errProp) fallar('Se renombró la tarjeta pero no sus movimientos', errProp);
  }

  return { ok: true, card: rowToCard(data) };
}

export async function getCardById(db: Db, id: string): Promise<Card | null> {
  const { data, error } = await db.supabase
    .from('cards').select('*').eq('user_id', db.userId).eq('id', id).maybeSingle();
  if (error) fallar('No se pudo leer la tarjeta', error);
  return data ? rowToCard(data) : null;
}

/**
 * Borra una tarjeta que no esté en uso.
 *
 * Con movimientos anotados no se borra: la FK los dejaría sin enlace y el gasto
 * por tarjeta perdería ese historial sin avisar. Archivarla sí se puede siempre,
 * y es lo que corresponde cuando una tarjeta se vence o se cancela.
 */
export async function deleteCard(db: Db, id: string): Promise<{ ok: boolean; error?: string }> {
  const { count, error: errUso } = await db.supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', db.userId)
    .eq('card_id', id);
  if (errUso) fallar('No se pudo verificar el uso de la tarjeta', errUso);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `La usan ${count} movimiento${count === 1 ? '' : 's'}. Archivala para sacarla de la lista sin perder el historial.`,
    };
  }

  const { error } = await db.supabase
    .from('cards').delete().eq('user_id', db.userId).eq('id', id);
  if (error) fallar('No se pudo eliminar la tarjeta', error);
  return { ok: true };
}

/**
 * Busca una tarjeta por lo que escribió el agente ("visa", "efectivo", …).
 *
 * El agente captura el medio de pago como texto libre, así que sin esto todo lo
 * anotado por WhatsApp quedaría sin enlazar y el gasto por tarjeta solo
 * reflejaría lo cargado a mano — que es la minoría.
 *
 * Coincidencia laxa a propósito: "pagué con la visa" tiene que encontrar
 * "Visa Popular". Si hay varias candidatas gana la de nombre más corto, que es
 * la menos específica y por lo tanto la que el usuario probablemente quiso.
 */
export async function buscarCardPorTexto(db: Db, texto: string | null | undefined): Promise<Card | null> {
  const busca = (texto ?? '').trim().toLowerCase();
  if (!busca) return null;

  const cards = await getCards(db);
  const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const objetivo = normal(busca);

  const candidatas = cards.filter(c => {
    const nombre = normal(c.name);
    return objetivo === nombre || objetivo.includes(nombre) || nombre.includes(objetivo);
  });
  if (candidatas.length === 0) return null;

  return candidatas.sort((a, b) => a.name.length - b.name.length)[0];
}


// ─── Lista de compras: la plantilla ───────────────────────────────────────────

function rowToShoppingList(row: Record<string, unknown>): ShoppingList {
  return {
    id: row.id as string,
    ledger_id: (row.ledger_id as string) ?? null,
    name: row.name as string,
    created_at: row.created_at as string,
  };
}

function rowToShoppingItem(row: Record<string, unknown>): ShoppingItem {
  return {
    id: row.id as string,
    list_id: row.list_id as string,
    name: row.name as string,
    category: (row.category as string) || 'Otros',
    quantity: Number(row.quantity),
    unit: (row.unit as string) || 'unidad',
    unit_price: Number(row.unit_price),
    created_at: row.created_at as string,
  };
}

export async function getShoppingLists(
  db: Db, ledgerId?: string | null,
): Promise<ShoppingListWithTotals[]> {
  // Sin filtrar por `user_id`: en una cuenta compartida la lista la arma uno y
  // la usa el otro. RLS ya recorta a lo visible.
  let q = db.supabase.from('shopping_lists').select('*').order('created_at', { ascending: false });
  if (ledgerId) q = q.eq('ledger_id', ledgerId);
  q = soloVisibles(q, db.userId, await misCuentas(db));

  const { data, error } = await q;
  if (error) fallar('No se pudieron leer las listas', error);

  const listas = (data ?? []).map(rowToShoppingList);
  if (listas.length === 0) return [];

  const { data: tot, error: errTot } = await db.supabase
    .rpc('shopping_list_totals', { p_list: listas.map(l => l.id) });
  if (errTot) fallar('No se pudieron calcular los totales', errTot);

  const mapa = new Map(
    ((tot ?? []) as Record<string, unknown>[])
      .map(f => [f.list_id as string, { total: Number(f.total ?? 0), items: Number(f.items ?? 0) }]),
  );
  return listas.map(l => ({ ...l, ...(mapa.get(l.id) ?? { total: 0, items: 0 }) }));
}

export async function getShoppingList(db: Db, id: string): Promise<ShoppingListDetail | null> {
  const { data, error } = await db.supabase
    .from('shopping_lists').select('*').eq('id', id).maybeSingle();
  if (error) fallar('No se pudo leer la lista', error);
  if (!data) return null;
  // RLS ya filtró en la web; con la service role no filtra nada.
  if (!(await puedoVer(db, data))) return null;

  const { data: items, error: errItems } = await db.supabase
    .from('shopping_items').select('*').eq('list_id', id).order('created_at');
  if (errItems) fallar('No se pudieron leer los artículos', errItems);

  const articulos = (items ?? []).map(rowToShoppingItem);
  return {
    ...rowToShoppingList(data),
    articulos,
    total: articulos.reduce((s, a) => s + a.quantity * a.unit_price, 0),
    items: articulos.length,
  };
}

export async function createShoppingList(
  db: Db, datos: { name: string; ledger_id: string | null },
): Promise<ShoppingList> {
  const { data, error } = await db.supabase
    .from('shopping_lists')
    .insert({ user_id: db.userId, name: datos.name, ledger_id: datos.ledger_id })
    .select()
    .single();
  if (error) fallar('No se pudo crear la lista', error);
  return rowToShoppingList(data);
}

export async function updateShoppingList(
  db: Db, id: string, cambios: { name?: string; ledger_id?: string | null },
): Promise<ShoppingList | null> {
  const campos: Record<string, unknown> = {};
  if (cambios.name !== undefined) campos.name = cambios.name;
  if (cambios.ledger_id !== undefined) campos.ledger_id = cambios.ledger_id;
  if (!(await getShoppingList(db, id))) return null;

  const { data, error } = await db.supabase
    .from('shopping_lists').update(campos).eq('id', id).select().maybeSingle();
  if (error) fallar('No se pudo actualizar la lista', error);
  return data ? rowToShoppingList(data) : null;
}

export async function deleteShoppingList(db: Db, id: string): Promise<boolean> {
  if (!(await getShoppingList(db, id))) return false;

  const { data, error } = await db.supabase
    .from('shopping_lists').delete().eq('id', id).select('id');
  if (error) fallar('No se pudo eliminar la lista', error);
  return (data ?? []).length > 0;
}

export async function addShoppingItem(
  db: Db,
  listId: string,
  datos: { name: string; category: string; quantity: number; unit: string; unit_price: number },
): Promise<ShoppingItem> {
  // El artículo no tiene dueño propio: hereda el de su lista, así que el
  // permiso se comprueba ahí. Sin esto, con la service role se podría escribir
  // en la lista de cualquiera pasando su id.
  if (!(await getShoppingList(db, listId))) throw new Error('No tenés acceso a esa lista');

  const { data, error } = await db.supabase
    .from('shopping_items').insert({ list_id: listId, ...datos }).select().single();
  if (error) fallar('No se pudo agregar el artículo', error);
  return rowToShoppingItem(data);
}

export async function updateShoppingItem(
  db: Db, id: string, cambios: Partial<Omit<ShoppingItem, 'id' | 'list_id' | 'created_at'>>,
): Promise<ShoppingItem | null> {
  if (!(await padreVisible(db, 'shopping_items', 'list_id', id, getShoppingList))) return null;

  const campos: Record<string, unknown> = {};
  for (const clave of ['name', 'category', 'quantity', 'unit', 'unit_price'] as const) {
    if (cambios[clave] !== undefined) campos[clave] = cambios[clave];
  }
  const { data, error } = await db.supabase
    .from('shopping_items').update(campos).eq('id', id).select().maybeSingle();
  if (error) fallar('No se pudo actualizar el artículo', error);
  return data ? rowToShoppingItem(data) : null;
}

export async function deleteShoppingItem(db: Db, id: string): Promise<boolean> {
  if (!(await padreVisible(db, 'shopping_items', 'list_id', id, getShoppingList))) return false;

  const { data, error } = await db.supabase
    .from('shopping_items').delete().eq('id', id).select('id');
  if (error) fallar('No se pudo eliminar el artículo', error);
  return (data ?? []).length > 0;
}

// ─── Lista de compras: la compra real ─────────────────────────────────────────

function rowToTrip(row: Record<string, unknown>): ShoppingTrip {
  return {
    id: row.id as string,
    ledger_id: (row.ledger_id as string) ?? null,
    list_id: (row.list_id as string) ?? null,
    name: row.name as string,
    date: row.date as string,
    closed: Boolean(row.closed),
    paid_amount: row.paid_amount == null ? null : Number(row.paid_amount),
    transaction_id: (row.transaction_id as string) ?? null,
    created_at: row.created_at as string,
  };
}

function rowToTripItem(row: Record<string, unknown>): ShoppingTripItem {
  return {
    id: row.id as string,
    trip_id: row.trip_id as string,
    name: row.name as string,
    category: (row.category as string) || 'Otros',
    quantity: Number(row.quantity),
    unit: (row.unit as string) || 'unidad',
    unit_price: Number(row.unit_price),
    checked: Boolean(row.checked),
    planned_quantity: row.planned_quantity == null ? null : Number(row.planned_quantity),
    planned_unit_price: row.planned_unit_price == null ? null : Number(row.planned_unit_price),
    created_at: row.created_at as string,
  };
}

const SIN_TOTALES = {
  total: 0, checkedTotal: 0, plannedTotal: 0, unplannedTotal: 0,
  items: 0, checkedItems: 0, unplannedItems: 0,
};

async function totalesDeCompras(db: Db, ids: string[]) {
  const mapa = new Map<string, typeof SIN_TOTALES>();
  if (ids.length === 0) return mapa;

  const { data, error } = await db.supabase.rpc('shopping_trip_totals', { p_trip: ids });
  if (error) fallar('No se pudieron calcular los totales de la compra', error);

  for (const f of (data ?? []) as Record<string, unknown>[]) {
    mapa.set(f.trip_id as string, {
      total: Number(f.total ?? 0),
      checkedTotal: Number(f.checked_total ?? 0),
      plannedTotal: Number(f.planned_total ?? 0),
      unplannedTotal: Number(f.unplanned_total ?? 0),
      items: Number(f.items ?? 0),
      checkedItems: Number(f.checked_items ?? 0),
      unplannedItems: Number(f.unplanned_items ?? 0),
    });
  }
  return mapa;
}

export async function getShoppingTrips(
  db: Db, opciones?: { ledgerId?: string | null; incluirCerradas?: boolean },
): Promise<ShoppingTripWithTotals[]> {
  let q = db.supabase.from('shopping_trips').select('*').order('date', { ascending: false });
  if (opciones?.ledgerId) q = q.eq('ledger_id', opciones.ledgerId);
  if (!opciones?.incluirCerradas) q = q.eq('closed', false);
  q = soloVisibles(q, db.userId, await misCuentas(db));

  const { data, error } = await q;
  if (error) fallar('No se pudieron leer las compras', error);

  const compras = (data ?? []).map(rowToTrip);
  const totales = await totalesDeCompras(db, compras.map(c => c.id));
  return compras.map(c => ({ ...c, ...(totales.get(c.id) ?? SIN_TOTALES) }));
}

export async function getShoppingTrip(db: Db, id: string): Promise<ShoppingTripDetail | null> {
  const { data, error } = await db.supabase
    .from('shopping_trips').select('*').eq('id', id).maybeSingle();
  if (error) fallar('No se pudo leer la compra', error);
  if (!data) return null;
  if (!(await puedoVer(db, data))) return null;

  const [itemsRes, totales] = await Promise.all([
    db.supabase.from('shopping_trip_items').select('*').eq('trip_id', id).order('created_at'),
    totalesDeCompras(db, [id]),
  ]);
  if (itemsRes.error) fallar('No se pudieron leer los artículos', itemsRes.error);

  return {
    ...rowToTrip(data),
    ...(totales.get(id) ?? SIN_TOTALES),
    articulos: (itemsRes.data ?? []).map(rowToTripItem),
  };
}

/**
 * Arranca una compra, copiando una lista si se indica.
 *
 * La copia es el punto de todo esto: desde acá los precios y las cantidades son
 * de esta compra y de ninguna otra. La lista queda intacta para la próxima vez,
 * y `planned_*` guarda con qué números se salió de casa.
 */
export async function iniciarCompra(
  db: Db,
  datos: { name: string; date: string; ledger_id: string | null; list_id?: string | null },
): Promise<{ ok: true; compra: ShoppingTrip } | { ok: false; error: string }> {
  if (datos.ledger_id && !(await getLedgerRole(db, datos.ledger_id))) {
    return { ok: false, error: 'No tenés acceso a esa cuenta.' };
  }

  const { data, error } = await db.supabase
    .from('shopping_trips')
    .insert({
      user_id: db.userId,
      ledger_id: datos.ledger_id,
      list_id: datos.list_id ?? null,
      name: datos.name,
      date: datos.date,
    })
    .select()
    .single();
  if (error) fallar('No se pudo iniciar la compra', error);
  const compra = rowToTrip(data);

  if (datos.list_id) {
    const lista = await getShoppingList(db, datos.list_id);
    if (lista && lista.articulos.length > 0) {
      const { error: errCopia } = await db.supabase.from('shopping_trip_items').insert(
        lista.articulos.map(a => ({
          trip_id: compra.id,
          name: a.name,
          category: a.category,
          quantity: a.quantity,
          unit: a.unit,
          unit_price: a.unit_price,
          planned_quantity: a.quantity,
          planned_unit_price: a.unit_price,
        })),
      );
      if (errCopia) fallar('Se creó la compra pero no se copió la lista', errCopia);
    }
  }

  return { ok: true, compra };
}

export async function addTripItem(
  db: Db,
  tripId: string,
  datos: { name: string; category: string; quantity: number; unit: string; unit_price: number },
): Promise<ShoppingTripItem> {
  if (!(await getShoppingTrip(db, tripId))) throw new Error('No tenés acceso a esa compra');

  // Sin `planned_*`: lo que se agrega en el súper no estaba planeado, y eso es
  // justamente lo que después se quiere ver.
  const { data, error } = await db.supabase
    .from('shopping_trip_items').insert({ trip_id: tripId, ...datos }).select().single();
  if (error) fallar('No se pudo agregar el artículo', error);
  return rowToTripItem(data);
}

export async function updateTripItem(
  db: Db,
  id: string,
  cambios: Partial<Pick<ShoppingTripItem, 'name' | 'category' | 'quantity' | 'unit' | 'unit_price' | 'checked'>>,
): Promise<ShoppingTripItem | null> {
  if (!(await padreVisible(db, 'shopping_trip_items', 'trip_id', id, getShoppingTrip))) return null;

  const campos: Record<string, unknown> = {};
  for (const clave of ['name', 'category', 'quantity', 'unit', 'unit_price', 'checked'] as const) {
    if (cambios[clave] !== undefined) campos[clave] = cambios[clave];
  }
  const { data, error } = await db.supabase
    .from('shopping_trip_items').update(campos).eq('id', id).select().maybeSingle();
  if (error) fallar('No se pudo actualizar el artículo', error);
  return data ? rowToTripItem(data) : null;
}

export async function deleteTripItem(db: Db, id: string): Promise<boolean> {
  if (!(await padreVisible(db, 'shopping_trip_items', 'trip_id', id, getShoppingTrip))) return false;

  const { data, error } = await db.supabase
    .from('shopping_trip_items').delete().eq('id', id).select('id');
  if (error) fallar('No se pudo eliminar el artículo', error);
  return (data ?? []).length > 0;
}

export async function deleteShoppingTrip(db: Db, id: string): Promise<boolean> {
  if (!(await getShoppingTrip(db, id))) return false;

  const { data, error } = await db.supabase
    .from('shopping_trips').delete().eq('id', id).select('id');
  if (error) fallar('No se pudo eliminar la compra', error);
  return (data ?? []).length > 0;
}

/**
 * Cierra la compra y la convierte en un gasto.
 *
 * Cobra solo lo tildado, salvo que se corrija el monto: en la caja aparecen
 * impuestos, ofertas y precios distintos a los de la góndola, y lo que vale es
 * el ticket.
 */
export async function cerrarCompra(
  db: Db,
  id: string,
  datos: { category: string; card_id?: string | null; amount?: number },
): Promise<{ ok: true; compra: ShoppingTrip; transaction: Transaction } | { ok: false; error: string }> {
  const compra = await getShoppingTrip(db, id);
  if (!compra) return { ok: false, error: 'Esa compra no existe.' };
  if (compra.closed) return { ok: false, error: 'Esa compra ya está cerrada.' };
  if (!compra.ledger_id) return { ok: false, error: 'Elegí en qué cuenta registrar el gasto.' };
  if (compra.checkedItems === 0) {
    return { ok: false, error: 'No tildaste ningún artículo, así que no hay nada que cobrar.' };
  }

  const rol = await getLedgerRole(db, compra.ledger_id);
  if (!rol) return { ok: false, error: 'No tenés acceso a esa cuenta.' };
  const cuenta = await getLedgerById(db, compra.ledger_id);

  const cobrado = datos.amount !== undefined ? datos.amount : compra.checkedTotal;

  // `getCardById` filtra por dueño, así que esto también valida que la tarjeta
  // sea suya. El nombre se guarda junto al id para que el movimiento conserve
  // con qué se pagó aunque después borren la tarjeta.
  const tarjeta = datos.card_id ? await getCardById(db, datos.card_id) : null;
  if (datos.card_id && !tarjeta) return { ok: false, error: 'Esa tarjeta no existe.' };

  const transaction = await createTransaction(db, {
    ledger_id: compra.ledger_id,
    type: 'expense',
    scope: cuenta?.type ?? 'personal',
    amount: cobrado,
    category: datos.category,
    description: compra.name,
    date: compra.date,
    source: 'manual',
    receipt_url: null,
    payment_method: tarjeta?.name ?? null,
    card_id: tarjeta?.id ?? null,
  });

  const { data, error } = await db.supabase
    .from('shopping_trips')
    .update({ closed: true, transaction_id: transaction.id, paid_amount: cobrado })
    .eq('id', id)
    .select()
    .single();
  if (error) fallar('Se registró el gasto pero no se pudo cerrar la compra', error);

  return { ok: true, compra: rowToTrip(data), transaction };
}

/**
 * Guarda los precios de la compra en la lista de la que salió.
 *
 * Es el camino de vuelta, y es explícito a propósito: la lista no se actualiza
 * sola porque uno pagó más caro un día puntual, pero cuando el precio nuevo vino
 * para quedarse, actualizar a mano artículo por artículo no lo hace nadie.
 */
export async function actualizarPreciosDeLista(
  db: Db, tripId: string,
): Promise<{ ok: true; actualizados: number } | { ok: false; error: string }> {
  const compra = await getShoppingTrip(db, tripId);
  if (!compra) return { ok: false, error: 'Esa compra no existe.' };
  if (!compra.list_id) return { ok: false, error: 'Esta compra no salió de ninguna lista.' };

  const lista = await getShoppingList(db, compra.list_id);
  if (!lista) return { ok: false, error: 'La lista de la que salió ya no existe.' };

  // Solo lo tildado y con precio: un artículo que no se compró no dice nada
  // sobre cuánto cuesta hoy.
  let actualizados = 0;
  for (const a of compra.articulos.filter(x => x.checked && x.unit_price > 0)) {
    const enLista = lista.articulos.find(
      l => l.name.trim().toLowerCase() === a.name.trim().toLowerCase(),
    );
    if (!enLista || enLista.unit_price === a.unit_price) continue;
    await updateShoppingItem(db, enLista.id, { unit_price: a.unit_price });
    actualizados++;
  }

  return { ok: true, actualizados };
}
