import { createPool, VercelPool } from '@vercel/postgres';
import { Transaction, TransactionFilters, Summary, Ledger, LedgerWithStats } from './types';

let _pool: VercelPool | null = null;
function getPool(): VercelPool {
  if (!_pool) _pool = createPool();
  return _pool;
}

let initialized = false;

async function init() {
  if (initialized) return;
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledgers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'green',
      type TEXT NOT NULL DEFAULT 'personal',
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      ledger_id TEXT,
      type TEXT NOT NULL,
      scope TEXT NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual'
    )
  `);
  // Add ledger_id column if it doesn't exist (for existing deployments)
  try {
    await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ledger_id TEXT`);
  } catch {
    // ignore if column already exists or DB doesn't support IF NOT EXISTS
  }
  initialized = true;
}

// ─── Ledger helpers ───────────────────────────────────────────────────────────

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

function rowToLedgerWithStats(row: Record<string, unknown>): LedgerWithStats {
  return {
    ...rowToLedger(row),
    transactionCount: Number(row.transaction_count ?? 0),
    balance: Number(row.balance ?? 0),
  };
}

export async function getAllLedgersWithStats(): Promise<LedgerWithStats[]> {
  await init();
  const { rows } = await getPool().query(`
    SELECT
      l.*,
      COUNT(t.id) AS transaction_count,
      COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END), 0)::float AS balance
    FROM ledgers l
    LEFT JOIN transactions t ON t.ledger_id = l.id
    GROUP BY l.id
    ORDER BY l.created_at ASC
  `);
  return rows.map(rowToLedgerWithStats);
}

export async function getLedgerById(id: string): Promise<Ledger | null> {
  await init();
  const { rows } = await getPool().query('SELECT * FROM ledgers WHERE id = $1', [id]);
  return rows[0] ? rowToLedger(rows[0]) : null;
}

export async function createLedger(data: Omit<Ledger, 'id' | 'created_at'>): Promise<Ledger> {
  await init();
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  await getPool().query(
    `INSERT INTO ledgers (id, name, color, type, description, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, data.name, data.color, data.type, data.description ?? '', created_at],
  );
  return (await getLedgerById(id))!;
}

export async function updateLedger(id: string, data: Partial<Omit<Ledger, 'id' | 'created_at'>>): Promise<Ledger | null> {
  await init();
  if (!(await getLedgerById(id))) return null;

  const updates: string[] = [];
  const params: (string | number)[] = [];

  if (data.name !== undefined) { updates.push(`name = $${params.length + 1}`); params.push(data.name); }
  if (data.color !== undefined) { updates.push(`color = $${params.length + 1}`); params.push(data.color); }
  if (data.type !== undefined) { updates.push(`type = $${params.length + 1}`); params.push(data.type); }
  if (data.description !== undefined) { updates.push(`description = $${params.length + 1}`); params.push(data.description); }

  if (updates.length === 0) return getLedgerById(id);

  params.push(id);
  await getPool().query(`UPDATE ledgers SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
  return getLedgerById(id);
}

export async function deleteLedger(id: string): Promise<{ ok: boolean; error?: string }> {
  await init();
  const { rows } = await getPool().query('SELECT COUNT(*) as cnt FROM transactions WHERE ledger_id = $1', [id]);
  if (Number(rows[0]?.cnt) > 0) {
    return { ok: false, error: 'La cuenta tiene transacciones. Elimínalas primero.' };
  }
  await getPool().query('DELETE FROM ledgers WHERE id = $1', [id]);
  return { ok: true };
}

// ─── Transaction helpers ──────────────────────────────────────────────────────

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
    source: row.source as Transaction['source'],
  };
}

export async function getAllTransactions(filters?: TransactionFilters): Promise<Transaction[]> {
  await init();
  const conditions: string[] = ['1=1'];
  const params: (string | number)[] = [];

  if (filters?.ledger_id) { conditions.push(`ledger_id = $${params.length + 1}`); params.push(filters.ledger_id); }
  if (filters?.type) { conditions.push(`type = $${params.length + 1}`); params.push(filters.type); }
  if (filters?.scope) { conditions.push(`scope = $${params.length + 1}`); params.push(filters.scope); }
  if (filters?.category) { conditions.push(`category = $${params.length + 1}`); params.push(filters.category); }
  if (filters?.startDate) { conditions.push(`date >= $${params.length + 1}`); params.push(filters.startDate); }
  if (filters?.endDate) { conditions.push(`date <= $${params.length + 1}`); params.push(filters.endDate); }
  if (filters?.search) {
    conditions.push(`(description ILIKE $${params.length + 1} OR category ILIKE $${params.length + 2})`);
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  const { rows } = await getPool().query(
    `SELECT * FROM transactions WHERE ${conditions.join(' AND ')} ORDER BY date DESC, created_at DESC`,
    params,
  );
  return rows.map(rowToTransaction);
}

export async function getTransactionById(id: string): Promise<Transaction | null> {
  await init();
  const { rows } = await getPool().query('SELECT * FROM transactions WHERE id = $1', [id]);
  return rows[0] ? rowToTransaction(rows[0]) : null;
}

export async function createTransaction(
  data: Omit<Transaction, 'id' | 'createdAt'>,
): Promise<Transaction> {
  await init();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await getPool().query(
    `INSERT INTO transactions (id, ledger_id, type, scope, amount, category, description, date, created_at, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, data.ledger_id ?? null, data.type, data.scope, data.amount, data.category, data.description, data.date, createdAt, data.source ?? 'manual'],
  );
  return (await getTransactionById(id))!;
}

export async function updateTransaction(
  id: string,
  data: Partial<Omit<Transaction, 'id' | 'createdAt'>>,
): Promise<Transaction | null> {
  await init();
  if (!(await getTransactionById(id))) return null;

  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (data.ledger_id !== undefined) { updates.push(`ledger_id = $${params.length + 1}`); params.push(data.ledger_id); }
  if (data.type !== undefined) { updates.push(`type = $${params.length + 1}`); params.push(data.type); }
  if (data.scope !== undefined) { updates.push(`scope = $${params.length + 1}`); params.push(data.scope); }
  if (data.amount !== undefined) { updates.push(`amount = $${params.length + 1}`); params.push(data.amount); }
  if (data.category !== undefined) { updates.push(`category = $${params.length + 1}`); params.push(data.category); }
  if (data.description !== undefined) { updates.push(`description = $${params.length + 1}`); params.push(data.description); }
  if (data.date !== undefined) { updates.push(`date = $${params.length + 1}`); params.push(data.date); }
  if (data.source !== undefined) { updates.push(`source = $${params.length + 1}`); params.push(data.source); }

  if (updates.length === 0) return getTransactionById(id);

  params.push(id);
  await getPool().query(`UPDATE transactions SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
  return getTransactionById(id);
}

export async function deleteTransaction(id: string): Promise<boolean> {
  await init();
  const result = await getPool().query('DELETE FROM transactions WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function getSummary(ledger_id?: string, startDate?: string, endDate?: string): Promise<Summary> {
  await init();
  const conditions: string[] = ['1=1'];
  const params: string[] = [];

  if (ledger_id) { conditions.push(`ledger_id = $${params.length + 1}`); params.push(ledger_id); }
  if (startDate) { conditions.push(`date >= $${params.length + 1}`); params.push(startDate); }
  if (endDate) { conditions.push(`date <= $${params.length + 1}`); params.push(endDate); }

  const filter = conditions.join(' AND ');

  const [totalsRes, categoryRes] = await Promise.all([
    getPool().query(
      `SELECT type, SUM(amount)::float as total FROM transactions WHERE ${filter} GROUP BY type`,
      params,
    ),
    getPool().query(
      `SELECT category, type, SUM(amount)::float as total, COUNT(*)::int as count
       FROM transactions WHERE ${filter}
       GROUP BY category, type ORDER BY total DESC`,
      params,
    ),
  ]);

  let totalIncome = 0, totalExpenses = 0;
  for (const r of totalsRes.rows) {
    if (r.type === 'income') totalIncome = r.total;
    if (r.type === 'expense') totalExpenses = r.total;
  }

  return {
    totalIncome,
    totalExpenses,
    totalBalance: totalIncome - totalExpenses,
    byCategory: categoryRes.rows.map(r => ({
      category: r.category as string,
      type: r.type as 'income' | 'expense',
      total: r.total as number,
      count: r.count as number,
    })),
  };
}
