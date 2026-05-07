import { createPool, VercelPool } from '@vercel/postgres';
import { Transaction, TransactionFilters, Summary } from './types';

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
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      scope TEXT NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      user_id TEXT
    )
  `);
  // Add user_id to existing tables that were created without it
  await pool.query(`
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id TEXT
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions (user_id)
  `);
  initialized = true;
}

function rowToTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: row.id as string,
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

export async function getAllTransactions(userId: string, filters?: TransactionFilters): Promise<Transaction[]> {
  await init();
  const conditions: string[] = ['user_id = $1'];
  const params: (string | number)[] = [userId];

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

export async function getTransactionById(userId: string, id: string): Promise<Transaction | null> {
  await init();
  const { rows } = await getPool().query(
    'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  return rows[0] ? rowToTransaction(rows[0]) : null;
}

export async function createTransaction(
  userId: string,
  data: Omit<Transaction, 'id' | 'createdAt'>,
): Promise<Transaction> {
  await init();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await getPool().query(
    `INSERT INTO transactions (id, type, scope, amount, category, description, date, created_at, source, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, data.type, data.scope, data.amount, data.category, data.description, data.date, createdAt, data.source ?? 'manual', userId],
  );
  return (await getTransactionById(userId, id))!;
}

export async function updateTransaction(
  userId: string,
  id: string,
  data: Partial<Omit<Transaction, 'id' | 'createdAt'>>,
): Promise<Transaction | null> {
  await init();
  if (!(await getTransactionById(userId, id))) return null;

  const updates: string[] = [];
  const params: (string | number)[] = [];

  if (data.type !== undefined) { updates.push(`type = $${params.length + 1}`); params.push(data.type); }
  if (data.scope !== undefined) { updates.push(`scope = $${params.length + 1}`); params.push(data.scope); }
  if (data.amount !== undefined) { updates.push(`amount = $${params.length + 1}`); params.push(data.amount); }
  if (data.category !== undefined) { updates.push(`category = $${params.length + 1}`); params.push(data.category); }
  if (data.description !== undefined) { updates.push(`description = $${params.length + 1}`); params.push(data.description); }
  if (data.date !== undefined) { updates.push(`date = $${params.length + 1}`); params.push(data.date); }
  if (data.source !== undefined) { updates.push(`source = $${params.length + 1}`); params.push(data.source); }

  if (updates.length === 0) return getTransactionById(userId, id);

  params.push(id, userId);
  await getPool().query(
    `UPDATE transactions SET ${updates.join(', ')} WHERE id = $${params.length - 1} AND user_id = $${params.length}`,
    params,
  );
  return getTransactionById(userId, id);
}

export async function deleteTransaction(userId: string, id: string): Promise<boolean> {
  await init();
  const result = await getPool().query(
    'DELETE FROM transactions WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getSummary(userId: string, startDate?: string, endDate?: string): Promise<Summary> {
  await init();
  const conditions: string[] = ['user_id = $1'];
  const params: string[] = [userId];

  if (startDate) { conditions.push(`date >= $${params.length + 1}`); params.push(startDate); }
  if (endDate) { conditions.push(`date <= $${params.length + 1}`); params.push(endDate); }

  const filter = conditions.join(' AND ');

  const [totalsRes, categoryRes] = await Promise.all([
    getPool().query(
      `SELECT scope, type, SUM(amount)::float as total FROM transactions WHERE ${filter} GROUP BY scope, type`,
      params,
    ),
    getPool().query(
      `SELECT category, type, scope, SUM(amount)::float as total, COUNT(*)::int as count
       FROM transactions WHERE ${filter}
       GROUP BY category, type, scope ORDER BY total DESC`,
      params,
    ),
  ]);

  let personalIncome = 0, personalExpenses = 0, businessIncome = 0, businessExpenses = 0;
  for (const r of totalsRes.rows) {
    if (r.scope === 'personal' && r.type === 'income') personalIncome = r.total;
    if (r.scope === 'personal' && r.type === 'expense') personalExpenses = r.total;
    if (r.scope === 'business' && r.type === 'income') businessIncome = r.total;
    if (r.scope === 'business' && r.type === 'expense') businessExpenses = r.total;
  }

  return {
    personalIncome, personalExpenses, businessIncome, businessExpenses,
    totalIncome: personalIncome + businessIncome,
    totalExpenses: personalExpenses + businessExpenses,
    personalBalance: personalIncome - personalExpenses,
    businessBalance: businessIncome - businessExpenses,
    totalBalance: (personalIncome + businessIncome) - (personalExpenses + businessExpenses),
    byCategory: categoryRes.rows.map(r => ({
      category: r.category as string,
      type: r.type as 'income' | 'expense',
      scope: r.scope as 'personal' | 'business',
      total: r.total as number,
      count: r.count as number,
    })),
  };
}
