const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const db = new Database(path.join(__dirname, 'fintrack.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '📦',
    color TEXT NOT NULL DEFAULT '#6366f1',
    type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'both')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    description TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    category_id TEXT NOT NULL REFERENCES categories(id),
    date TEXT NOT NULL,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
  CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
`);

// Seed default categories if empty
const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
if (catCount.count === 0) {
  const insert = db.prepare('INSERT INTO categories (id, name, icon, color, type) VALUES (?, ?, ?, ?, ?)');
  const defaults = [
    ['cat-1', 'Alimentação', '🍔', '#f97316', 'expense'],
    ['cat-2', 'Moradia', '🏠', '#3b82f6', 'expense'],
    ['cat-3', 'Transporte', '🚗', '#8b5cf6', 'expense'],
    ['cat-4', 'Saúde', '💊', '#ef4444', 'expense'],
    ['cat-5', 'Educação', '🎓', '#06b6d4', 'expense'],
    ['cat-6', 'Lazer', '🎬', '#ec4899', 'expense'],
    ['cat-7', 'Compras', '🛒', '#eab308', 'expense'],
    ['cat-8', 'Contas', '💡', '#f59e0b', 'expense'],
    ['cat-9', 'Salário', '💼', '#22c55e', 'income'],
    ['cat-10', 'Freelance', '💰', '#10b981', 'income'],
    ['cat-11', 'Investimentos', '📈', '#14b8a6', 'income'],
  ];
  const insertMany = db.transaction((cats) => {
    for (const c of cats) insert.run(...c);
  });
  insertMany(defaults);
}

// ===== API Routes =====

// --- Categories ---
app.get('/api/categories', (req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY name').all();
  res.json(rows);
});

app.post('/api/categories', (req, res) => {
  const { id, name, icon, color, type } = req.body;
  if (!id || !name || !type) return res.status(400).json({ error: 'Campos obrigatórios: id, name, type' });
  try {
    db.prepare('INSERT INTO categories (id, name, icon, color, type) VALUES (?, ?, ?, ?, ?)')
      .run(id, name, icon || '📦', color || '#6366f1', type);
    res.status(201).json({ id, name, icon, color, type });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/categories/:id', (req, res) => {
  const { id } = req.params;
  const used = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE category_id = ?').get(id);
  if (used.count > 0) {
    return res.status(409).json({ error: 'Categoria em uso — remova as transações primeiro' });
  }
  const result = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Categoria não encontrada' });
  res.json({ success: true });
});

// --- Transactions ---
app.get('/api/transactions', (req, res) => {
  const { type, category_id, month, search, limit, offset } = req.query;
  let sql = 'SELECT * FROM transactions WHERE 1=1';
  const params = [];

  if (type && type !== 'all') { sql += ' AND type = ?'; params.push(type); }
  if (category_id && category_id !== 'all') { sql += ' AND category_id = ?'; params.push(category_id); }
  if (month) { sql += " AND substr(date, 1, 7) = ?"; params.push(month); }
  if (search) { sql += ' AND (description LIKE ? OR notes LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  sql += ' ORDER BY date DESC, created_at DESC';

  if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }
  if (offset) { sql += ' OFFSET ?'; params.push(parseInt(offset)); }

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

app.get('/api/transactions/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Transação não encontrada' });
  res.json(row);
});

app.post('/api/transactions', (req, res) => {
  const { id, type, description, amount, category_id, date, notes } = req.body;
  if (!id || !type || !description || !amount || !category_id || !date) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }
  try {
    db.prepare('INSERT INTO transactions (id, type, description, amount, category_id, date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, type, description, amount, category_id, date, notes || '');
    res.status(201).json({ id, type, description, amount, category_id, date, notes });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/transactions/:id', (req, res) => {
  const { type, description, amount, category_id, date, notes } = req.body;
  const result = db.prepare(
    'UPDATE transactions SET type=?, description=?, amount=?, category_id=?, date=?, notes=? WHERE id=?'
  ).run(type, description, amount, category_id, date, notes || '', req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Transação não encontrada' });
  res.json({ id: req.params.id, type, description, amount, category_id, date, notes });
});

app.delete('/api/transactions/:id', (req, res) => {
  const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Transação não encontrada' });
  res.json({ success: true });
});

// --- Dashboard Stats ---
app.get('/api/stats/summary', (req, res) => {
  const { month } = req.query;

  const totalIncome = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = ?').get('income').total;
  const totalExpenses = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = ?').get('expense').total;

  let monthIncome = 0, monthExpenses = 0;
  if (month) {
    monthIncome = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'income' AND substr(date, 1, 7) = ?").get(month).total;
    monthExpenses = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'expense' AND substr(date, 1, 7) = ?").get(month).total;
  }

  res.json({
    balance: totalIncome - totalExpenses,
    monthIncome,
    monthExpenses,
    monthSavings: monthIncome - monthExpenses,
  });
});

app.get('/api/stats/by-category', (req, res) => {
  const { month, type, months } = req.query;
  let sql = 'SELECT category_id, SUM(amount) as total FROM transactions WHERE type = ?';
  const params = [type || 'expense'];

  if (month) {
    sql += " AND substr(date, 1, 7) = ?";
    params.push(month);
  } else if (months) {
    const monthList = months.split(',');
    sql += ` AND substr(date, 1, 7) IN (${monthList.map(() => '?').join(',')})`;
    params.push(...monthList);
  }

  sql += ' GROUP BY category_id ORDER BY total DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

app.get('/api/stats/monthly', (req, res) => {
  const { months_back } = req.query;
  const count = parseInt(months_back) || 6;
  const now = new Date();
  const result = [];

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const income = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'income' AND substr(date, 1, 7) = ?").get(key).total;
    const expense = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'expense' AND substr(date, 1, 7) = ?").get(key).total;
    result.push({ month: key, label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), income, expense });
  }

  res.json(result);
});

// Start server
app.listen(PORT, () => {
  console.log(`FinTrack rodando em http://localhost:${PORT}`);
});
