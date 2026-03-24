const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Database setup
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'fintrack.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '📦',
    color TEXT NOT NULL DEFAULT '#6366f1',
    type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'both')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    description TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    category_id TEXT NOT NULL REFERENCES categories(id),
    date TEXT NOT NULL,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
`);

// Clean expired sessions on startup
db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();

// ===== Auth Helpers =====
function genId() { return crypto.randomUUID(); }
function genToken() { return crypto.randomBytes(32).toString('hex'); }

function seedDefaultCategories(userId) {
  const insert = db.prepare('INSERT INTO categories (id, user_id, name, icon, color, type) VALUES (?, ?, ?, ?, ?, ?)');
  const defaults = [
    ['Alimentação', '🍔', '#f97316', 'expense'],
    ['Moradia', '🏠', '#3b82f6', 'expense'],
    ['Transporte', '🚗', '#8b5cf6', 'expense'],
    ['Saúde', '💊', '#ef4444', 'expense'],
    ['Educação', '🎓', '#06b6d4', 'expense'],
    ['Lazer', '🎬', '#ec4899', 'expense'],
    ['Compras', '🛒', '#eab308', 'expense'],
    ['Contas', '💡', '#f59e0b', 'expense'],
    ['Salário', '💼', '#22c55e', 'income'],
    ['Freelance', '💰', '#10b981', 'income'],
    ['Investimentos', '📈', '#14b8a6', 'income'],
  ];
  const tx = db.transaction(() => {
    for (const [name, icon, color, type] of defaults) {
      insert.run(genId(), userId, name, icon, color, type);
    }
  });
  tx();
}

// ===== Auth Middleware =====
function requireAuth(req, res, next) {
  const token = req.cookies.session_token;
  if (!token) return res.status(401).json({ error: 'Não autenticado' });

  const session = db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')").get(token);
  if (!session) {
    res.clearCookie('session_token');
    return res.status(401).json({ error: 'Sessão expirada' });
  }

  const user = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(session.user_id);
  if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });

  req.user = user;
  next();
}

// ===== Serve login page for unauthenticated users =====
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve static files only for authenticated users (except login assets)
app.use((req, res, next) => {
  // Allow login page and its assets
  if (req.path === '/login' || req.path === '/login.html' || req.path.startsWith('/api/auth')) {
    return next();
  }
  // Allow static CSS/JS (they're useless without data anyway)
  if (req.path.endsWith('.css') || req.path.endsWith('.js') || req.path === '/favicon.ico') {
    return express.static(path.join(__dirname, 'public'))(req, res, next);
  }
  // For root path, check auth and redirect
  if (req.path === '/' || req.path === '/index.html') {
    const token = req.cookies.session_token;
    if (!token) return res.redirect('/login');
    const session = db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')").get(token);
    if (!session) {
      res.clearCookie('session_token');
      return res.redirect('/login');
    }
  }
  express.static(path.join(__dirname, 'public'))(req, res, next);
});

// ===== Auth Routes =====
app.post('/api/auth/register', (req, res) => {
  const { username, password, display_name } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  if (username.length < 3) return res.status(400).json({ error: 'Usuário deve ter pelo menos 3 caracteres' });
  if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Este usuário já existe' });

  const id = genId();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)')
    .run(id, username.toLowerCase(), hash, display_name || username);

  seedDefaultCategories(id);

  // Auto-login after register
  const token = genToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, id, expiresAt);

  res.cookie('session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  res.status(201).json({ success: true, user: { id, username, display_name: display_name || username } });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }

  const token = genToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt);

  res.cookie('session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  res.json({ success: true, user: { id: user.id, username: user.username, display_name: user.display_name } });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies.session_token;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie('session_token');
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// ===== Protected API Routes =====

// --- Categories ---
app.get('/api/categories', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY name').all(req.user.id);
  res.json(rows);
});

app.post('/api/categories', requireAuth, (req, res) => {
  const { id, name, icon, color, type } = req.body;
  if (!id || !name || !type) return res.status(400).json({ error: 'Campos obrigatórios: id, name, type' });
  try {
    db.prepare('INSERT INTO categories (id, user_id, name, icon, color, type) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, req.user.id, name, icon || '📦', color || '#6366f1', type);
    res.status(201).json({ id, name, icon, color, type });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/categories/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const cat = db.prepare('SELECT id FROM categories WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });

  const used = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE category_id = ? AND user_id = ?').get(id, req.user.id);
  if (used.count > 0) return res.status(409).json({ error: 'Categoria em uso — remova as transações primeiro' });

  db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(id, req.user.id);
  res.json({ success: true });
});

// --- Transactions ---
app.get('/api/transactions', requireAuth, (req, res) => {
  const { type, category_id, month, search, limit, offset } = req.query;
  let sql = 'SELECT * FROM transactions WHERE user_id = ?';
  const params = [req.user.id];

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

app.get('/api/transactions/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Transação não encontrada' });
  res.json(row);
});

app.post('/api/transactions', requireAuth, (req, res) => {
  const { id, type, description, amount, category_id, date, notes } = req.body;
  if (!id || !type || !description || !amount || !category_id || !date) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }
  // Verify category belongs to user
  const cat = db.prepare('SELECT id FROM categories WHERE id = ? AND user_id = ?').get(category_id, req.user.id);
  if (!cat) return res.status(400).json({ error: 'Categoria inválida' });

  try {
    db.prepare('INSERT INTO transactions (id, user_id, type, description, amount, category_id, date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, req.user.id, type, description, amount, category_id, date, notes || '');
    res.status(201).json({ id, type, description, amount, category_id, date, notes });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/transactions/:id', requireAuth, (req, res) => {
  const { type, description, amount, category_id, date, notes } = req.body;
  const result = db.prepare(
    'UPDATE transactions SET type=?, description=?, amount=?, category_id=?, date=?, notes=? WHERE id=? AND user_id=?'
  ).run(type, description, amount, category_id, date, notes || '', req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Transação não encontrada' });
  res.json({ id: req.params.id, type, description, amount, category_id, date, notes });
});

app.delete('/api/transactions/:id', requireAuth, (req, res) => {
  const result = db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Transação não encontrada' });
  res.json({ success: true });
});

// --- Stats ---
app.get('/api/stats/summary', requireAuth, (req, res) => {
  const { month } = req.query;
  const uid = req.user.id;

  const totalIncome = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = ? AND user_id = ?').get('income', uid).total;
  const totalExpenses = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = ? AND user_id = ?').get('expense', uid).total;

  let monthIncome = 0, monthExpenses = 0;
  if (month) {
    monthIncome = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'income' AND user_id = ? AND substr(date, 1, 7) = ?").get(uid, month).total;
    monthExpenses = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'expense' AND user_id = ? AND substr(date, 1, 7) = ?").get(uid, month).total;
  }

  res.json({ balance: totalIncome - totalExpenses, monthIncome, monthExpenses, monthSavings: monthIncome - monthExpenses });
});

app.get('/api/stats/by-category', requireAuth, (req, res) => {
  const { month, type, months } = req.query;
  let sql = 'SELECT category_id, SUM(amount) as total FROM transactions WHERE type = ? AND user_id = ?';
  const params = [type || 'expense', req.user.id];

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

app.get('/api/stats/monthly', requireAuth, (req, res) => {
  const { months_back } = req.query;
  const count = parseInt(months_back) || 6;
  const uid = req.user.id;
  const now = new Date();
  const result = [];

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const income = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'income' AND user_id = ? AND substr(date, 1, 7) = ?").get(uid, key).total;
    const expense = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'expense' AND user_id = ? AND substr(date, 1, 7) = ?").get(uid, key).total;
    result.push({ month: key, label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), income, expense });
  }

  res.json(result);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`FinTrack rodando em http://localhost:${PORT}`);
});
