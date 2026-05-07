import Database from 'better-sqlite3';
import path from 'path';
import { Transaction, TransactionFilters, Summary } from './types';

const DB_PATH = path.join(process.cwd(), 'finances.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.exec(`
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
  }
  return _db;
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

export function getAllTransactions(filters?: TransactionFilters): Transaction[] {
  const db = getDb();
  let query = 'SELECT * FROM transactions WHERE 1=1';
  const params: (string | number)[] = [];

  if (filters?.type) { query += ' AND type = ?'; params.push(filters.type); }
  if (filters?.scope) { query += ' AND scope = ?'; params.push(filters.scope); }
  if (filters?.category) { query += ' AND category = ?'; params.push(filters.category); }
  if (filters?.startDate) { query += ' AND date >= ?'; params.push(filters.startDate); }
  if (filters?.endDate) { query += ' AND date <= ?'; params.push(filters.endDate); }
  if (filters?.search) {
    query += ' AND (description LIKE ? OR category LIKE ?)';
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  query += ' ORDER BY date DESC, created_at DESC';
  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map(rowToTransaction);
}

export function getTransactionById(id: string): Transaction | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToTransaction(row) : null;
}

export function createTransaction(data: Omit<Transaction, 'id' | 'createdAt'>): Transaction {
  const db = getDb();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO transactions (id, type, scope, amount, category, description, date, created_at, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.type, data.scope, data.amount, data.category, data.description, data.date, createdAt, data.source ?? 'manual');
  return getTransactionById(id)!;
}

export function updateTransaction(id: string, data: Partial<Omit<Transaction, 'id' | 'createdAt'>>): Transaction | null {
  const db = getDb();
  if (!getTransactionById(id)) return null;

  const updates: string[] = [];
  const params: (string | number)[] = [];

  if (data.type !== undefined) { updates.push('type = ?'); params.push(data.type); }
  if (data.scope !== undefined) { updates.push('scope = ?'); params.push(data.scope); }
  if (data.amount !== undefined) { updates.push('amount = ?'); params.push(data.amount); }
  if (data.category !== undefined) { updates.push('category = ?'); params.push(data.category); }
  if (data.description !== undefined) { updates.push('description = ?'); params.push(data.description); }
  if (data.date !== undefined) { updates.push('date = ?'); params.push(data.date); }
  if (data.source !== undefined) { updates.push('source = ?'); params.push(data.source); }

  if (updates.length === 0) return getTransactionById(id);

  params.push(id);
  db.prepare(`UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getTransactionById(id);
}

export function deleteTransaction(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getSummary(startDate?: string, endDate?: string): Summary {
  const db = getDb();
  let dateFilter = '';
  const params: string[] = [];
  if (startDate) { dateFilter += ' AND date >= ?'; params.push(startDate); }
  if (endDate) { dateFilter += ' AND date <= ?'; params.push(endDate); }

  const totalsRows = db.prepare(`
    SELECT scope, type, SUM(amount) as total
    FROM transactions WHERE 1=1 ${dateFilter}
    GROUP BY scope, type
  `).all(...params) as { scope: string; type: string; total: number }[];

  let personalIncome = 0, personalExpenses = 0, businessIncome = 0, businessExpenses = 0;
  for (const r of totalsRows) {
    if (r.scope === 'personal' && r.type === 'income') personalIncome = r.total;
    if (r.scope === 'personal' && r.type === 'expense') personalExpenses = r.total;
    if (r.scope === 'business' && r.type === 'income') businessIncome = r.total;
    if (r.scope === 'business' && r.type === 'expense') businessExpenses = r.total;
  }

  const categoryRows = db.prepare(`
    SELECT category, type, scope, SUM(amount) as total, COUNT(*) as count
    FROM transactions WHERE 1=1 ${dateFilter}
    GROUP BY category, type, scope ORDER BY total DESC
  `).all(...params) as { category: string; type: string; scope: string; total: number; count: number }[];

  return {
    personalIncome, personalExpenses, businessIncome, businessExpenses,
    totalIncome: personalIncome + businessIncome,
    totalExpenses: personalExpenses + businessExpenses,
    personalBalance: personalIncome - personalExpenses,
    businessBalance: businessIncome - businessExpenses,
    totalBalance: (personalIncome + businessIncome) - (personalExpenses + businessExpenses),
    byCategory: categoryRows.map(r => ({
      category: r.category,
      type: r.type as 'income' | 'expense',
      scope: r.scope as 'personal' | 'business',
      total: r.total,
      count: r.count,
    })),
  };
}
