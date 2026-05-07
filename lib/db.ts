import { createClient } from '@libsql/client';
import { Transaction, TransactionFilters, Summary } from './types';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL ?? 'file:./finances.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let initialized = false;

async function init() {
  if (initialized) return;
  await client.execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      scope TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual'
    )
  `);
  initialized = true;
}

function rowToTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: row.id as string,
    type: row.type as Transaction['type'],
    scope: row.scope as Transaction['scope'],
    amount: row.amount as number,
    category: row.category as string,
    description: row.description as string,
    date: row.date as string,
    createdAt: row.created_at as string,
    source: row.source as Transaction['source'],
  };
}

export async function getAllTransactions(filters?: TransactionFilters): Promise<Transaction[]> {
  await init();
  let query = 'SELECT * FROM transactions WHERE 1=1';
  const args: (string | number)[] = [];

  if (filters?.type) { query += ' AND type = ?'; args.push(filters.type); }
  if (filters?.scope) { query += ' AND scope = ?'; args.push(filters.scope); }
  if (filters?.category) { query += ' AND category = ?'; args.push(filters.category); }
  if (filters?.startDate) { query += ' AND date >= ?'; args.push(filters.startDate); }
  if (filters?.endDate) { query += ' AND date <= ?'; args.push(filters.endDate); }
  if (filters?.search) {
    query += ' AND (description LIKE ? OR category LIKE ?)';
    args.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  query += ' ORDER BY date DESC, created_at DESC';
  const result = await client.execute({ sql: query, args });
  return result.rows.map(r => rowToTransaction(r as unknown as Record<string, unknown>));
}

export async function getTransactionById(id: string): Promise<Transaction | null> {
  await init();
  const result = await client.execute({
    sql: 'SELECT * FROM transactions WHERE id = ?',
    args: [id],
  });
  if (result.rows.length === 0) return null;
  return rowToTransaction(result.rows[0] as unknown as Record<string, unknown>);
}

export async function createTransaction(data: Omit<Transaction, 'id' | 'createdAt'>): Promise<Transaction> {
  await init();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO transactions (id, type, scope, amount, category, description, date, created_at, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, data.type, data.scope, data.amount, data.category, data.description, data.date, createdAt, data.source ?? 'manual'],
  });
  return (await getTransactionById(id))!;
}

export async function updateTransaction(id: string, data: Partial<Omit<Transaction, 'id' | 'createdAt'>>): Promise<Transaction | null> {
  await init();
  if (!(await getTransactionById(id))) return null;

  const updates: string[] = [];
  const args: (string | number)[] = [];

  if (data.type !== undefined) { updates.push('type = ?'); args.push(data.type); }
  if (data.scope !== undefined) { updates.push('scope = ?'); args.push(data.scope); }
  if (data.amount !== undefined) { updates.push('amount = ?'); args.push(data.amount); }
  if (data.category !== undefined) { updates.push('category = ?'); args.push(data.category); }
  if (data.description !== undefined) { updates.push('description = ?'); args.push(data.description); }
  if (data.date !== undefined) { updates.push('date = ?'); args.push(data.date); }
  if (data.source !== undefined) { updates.push('source = ?'); args.push(data.source); }

  if (updates.length === 0) return getTransactionById(id);

  args.push(id);
  await client.execute({ sql: `UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`, args });
  return getTransactionById(id);
}

export async function deleteTransaction(id: string): Promise<boolean> {
  await init();
  const result = await client.execute({ sql: 'DELETE FROM transactions WHERE id = ?', args: [id] });
  return (result.rowsAffected ?? 0) > 0;
}

export async function getSummary(startDate?: string, endDate?: string): Promise<Summary> {
  await init();
  let dateFilter = '';
  const args: string[] = [];
  if (startDate) { dateFilter += ' AND date >= ?'; args.push(startDate); }
  if (endDate) { dateFilter += ' AND date <= ?'; args.push(endDate); }

  const totalsResult = await client.execute({
    sql: `SELECT scope, type, SUM(amount) as total FROM transactions WHERE 1=1 ${dateFilter} GROUP BY scope, type`,
    args,
  });

  let personalIncome = 0, personalExpenses = 0, businessIncome = 0, businessExpenses = 0;
  for (const r of totalsResult.rows) {
    const row = r as unknown as { scope: string; type: string; total: number };
    if (row.scope === 'personal' && row.type === 'income') personalIncome = row.total;
    if (row.scope === 'personal' && row.type === 'expense') personalExpenses = row.total;
    if (row.scope === 'business' && row.type === 'income') businessIncome = row.total;
    if (row.scope === 'business' && row.type === 'expense') businessExpenses = row.total;
  }

  const categoryResult = await client.execute({
    sql: `SELECT category, type, scope, SUM(amount) as total, COUNT(*) as count
          FROM transactions WHERE 1=1 ${dateFilter}
          GROUP BY category, type, scope ORDER BY total DESC`,
    args,
  });

  return {
    personalIncome, personalExpenses, businessIncome, businessExpenses,
    totalIncome: personalIncome + businessIncome,
    totalExpenses: personalExpenses + businessExpenses,
    personalBalance: personalIncome - personalExpenses,
    businessBalance: businessIncome - businessExpenses,
    totalBalance: (personalIncome + businessIncome) - (personalExpenses + businessExpenses),
    byCategory: categoryResult.rows.map(r => {
      const row = r as unknown as { category: string; type: string; scope: string; total: number; count: number };
      return {
        category: row.category,
        type: row.type as 'income' | 'expense',
        scope: row.scope as 'personal' | 'business',
        total: row.total,
        count: row.count,
      };
    }),
  };
}
