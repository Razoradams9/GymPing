// Storage. On a computer you own, GymPing keeps everything in one SQLite file.
// On hosts without a lasting disk (e.g. Render's free plan), set DATABASE_URL
// to a Postgres database and everything, including the WhatsApp link, lives there.

const path = require('path');

const DEFAULT_TEMPLATE =
  'Hey {first_name}! 👋 Your membership at {gym} expires {when} ({date}). Renew now to keep your streak going: {link}';

const usePostgres = !!process.env.DATABASE_URL;

// query(sql, params) -> rows. SQL is written once with '?' placeholders and runs on both.
let query;
let close = async () => {};

const TABLES = (id) => `
  -- Lightweight WhatsApp link: its sign-in keys and the owner's contacts.
  CREATE TABLE IF NOT EXISTS wa_auth (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS wa_contacts (
    phone TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS members (
    id ${id},
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    membership_end_date TEXT NOT NULL,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payment_url TEXT,
    gym_name TEXT
  );

  -- One row per member per day: the single reminder that member gets that day.
  CREATE TABLE IF NOT EXISTS reminders (
    id ${id},
    member_id INTEGER NOT NULL,
    member_name TEXT,
    phone TEXT,
    membership_end_date TEXT NOT NULL,
    reminder_date TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 1,
    error TEXT,
    message TEXT,
    sent_at TEXT NOT NULL,
    UNIQUE (member_id, reminder_date)
  );

  CREATE TABLE IF NOT EXISTS renewals (
    id ${id},
    member_id INTEGER NOT NULL,
    member_name TEXT,
    old_end_date TEXT NOT NULL,
    new_end_date TEXT NOT NULL,
    renewed_at TEXT NOT NULL
  );
`;

// Settings columns added after the first release.
const SETTINGS_COLUMNS = {
  message_template: 'TEXT',
  send_hour: 'INTEGER NOT NULL DEFAULT 9',
  renewal_months: 'INTEGER NOT NULL DEFAULT 1'
};

async function initPostgres() {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  pool.on('error', (err) => console.error('Database connection error:', err.message));
  query = async (sql, params = []) => {
    let n = 0;
    return (await pool.query(sql.replace(/\?/g, () => `$${++n}`), params)).rows;
  };
  close = () => pool.end();

  await pool.query(TABLES('SERIAL PRIMARY KEY'));
  for (const [name, type] of Object.entries(SETTINGS_COLUMNS)) {
    await pool.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS ${name} ${type}`);
  }
  // The WhatsApp link, so it survives restarts on hosts that wipe their disk.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_sessions (
      name TEXT PRIMARY KEY,
      data BYTEA NOT NULL,
      saved_at TEXT NOT NULL
    )
  `);
}

async function initSqlite() {
  const { DatabaseSync } = require('node:sqlite');
  const dataDir = process.env.GYMPING_DATA_DIR || __dirname;
  const db = new DatabaseSync(process.env.GYMPING_DB || path.join(dataDir, 'gymping.db'));
  query = async (sql, params = []) => db.prepare(sql).all(...params);
  close = async () => db.close();

  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(TABLES('INTEGER PRIMARY KEY AUTOINCREMENT'));

  const existing = db.prepare('PRAGMA table_info(settings)').all().map((c) => c.name);
  for (const [name, type] of Object.entries(SETTINGS_COLUMNS)) {
    if (!existing.includes(name)) db.exec(`ALTER TABLE settings ADD COLUMN ${name} ${type}`);
  }

  // Carry over the reminder log from the first release.
  const oldLog = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'reminders_sent'")
    .get();
  if (oldLog) {
    db.exec(`
      INSERT OR IGNORE INTO reminders
        (member_id, member_name, phone, membership_end_date, reminder_date, status, sent_at)
      SELECT r.member_id, m.name, m.phone, r.membership_end_date, date(r.sent_at), 'sent',
             replace(r.sent_at, ' ', 'T') || 'Z'
      FROM reminders_sent r LEFT JOIN members m ON m.id = r.member_id
      WHERE r.member_id IS NOT NULL;
      DROP TABLE reminders_sent;
    `);
  }
}

// Must finish before anything else is called.
async function init() {
  await (usePostgres ? initPostgres() : initSqlite());
  await query(
    "INSERT INTO settings (id, gym_name, payment_url) VALUES (1, 'My Gym', '') ON CONFLICT (id) DO NOTHING"
  );
}

const nowIso = () => new Date().toISOString();
const first = async (sql, params) => (await query(sql, params))[0];
// Ids arrive from URLs; anything that isn't a whole number matches nothing.
const toId = (id) => (Number.isInteger(Number(id)) ? Number(id) : -1);

// ---- Members ----

function getAllMembers() {
  return query('SELECT * FROM members ORDER BY membership_end_date ASC, name ASC');
}

function getMemberById(id) {
  return first('SELECT * FROM members WHERE id = ?', [toId(id)]);
}

function addMember(name, phone, membership_end_date) {
  return first(
    'INSERT INTO members (name, phone, membership_end_date, created_at) VALUES (?, ?, ?, ?) RETURNING *',
    [name, phone, membership_end_date, nowIso()]
  );
}

function updateMember(id, name, phone, membership_end_date) {
  return first(
    'UPDATE members SET name = ?, phone = ?, membership_end_date = ? WHERE id = ? RETURNING *',
    [name, phone, membership_end_date, toId(id)]
  );
}

async function deleteMember(id) {
  await query('DELETE FROM members WHERE id = ?', [toId(id)]);
}

function getMembersExpiringBetween(from, to) {
  return query(
    'SELECT * FROM members WHERE membership_end_date BETWEEN ? AND ? ORDER BY membership_end_date ASC',
    [from, to]
  );
}

// ---- Settings ----

async function getSettings() {
  const s = await first('SELECT * FROM settings WHERE id = 1');
  return { ...s, message_template: s.message_template || DEFAULT_TEMPLATE };
}

async function saveSettings(s) {
  await query(
    `UPDATE settings SET gym_name = ?, payment_url = ?, message_template = ?, send_hour = ?,
       renewal_months = ? WHERE id = 1`,
    [s.gym_name, s.payment_url, s.message_template, s.send_hour, s.renewal_months]
  );
  return getSettings();
}

// ---- Reminders ----

function getReminder(member_id, reminder_date) {
  return first('SELECT * FROM reminders WHERE member_id = ? AND reminder_date = ?', [
    member_id,
    reminder_date
  ]);
}

function getReminderById(id) {
  return first('SELECT * FROM reminders WHERE id = ?', [toId(id)]);
}

// Records the outcome of today's reminder for a member; a repeat attempt updates the same row.
function recordReminder(member, reminder_date, status, message, error) {
  return first(
    `INSERT INTO reminders
       (member_id, member_name, phone, membership_end_date, reminder_date, status, error, message, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (member_id, reminder_date) DO UPDATE SET
       member_name = excluded.member_name, phone = excluded.phone,
       membership_end_date = excluded.membership_end_date, status = excluded.status,
       error = excluded.error, message = excluded.message, sent_at = excluded.sent_at,
       attempts = reminders.attempts + 1
     RETURNING *`,
    [
      member.id,
      member.name,
      member.phone,
      member.membership_end_date,
      reminder_date,
      status,
      error || null,
      message,
      nowIso()
    ]
  );
}

function getRecentReminders(limit) {
  return query('SELECT * FROM reminders ORDER BY sent_at DESC LIMIT ?', [limit]);
}

// ---- Renewals ----

async function logRenewal(member, new_end_date) {
  await query(
    'INSERT INTO renewals (member_id, member_name, old_end_date, new_end_date, renewed_at) VALUES (?, ?, ?, ?, ?)',
    [member.id, member.name, member.membership_end_date, new_end_date, nowIso()]
  );
}

function getRecentRenewals(limit) {
  return query('SELECT * FROM renewals ORDER BY renewed_at DESC LIMIT ?', [limit]);
}

// ---- WhatsApp link (Postgres only) ----

async function hasSession(name) {
  return !!(await first('SELECT 1 AS found FROM wa_sessions WHERE name = ?', [name]));
}

async function saveSession(name, data) {
  await query(
    `INSERT INTO wa_sessions (name, data, saved_at) VALUES (?, ?, ?)
     ON CONFLICT (name) DO UPDATE SET data = excluded.data, saved_at = excluded.saved_at`,
    [name, data, nowIso()]
  );
}

async function loadSession(name) {
  const row = await first('SELECT data FROM wa_sessions WHERE name = ?', [name]);
  return row ? row.data : null;
}

async function deleteSession(name) {
  await query('DELETE FROM wa_sessions WHERE name = ?', [name]);
}

// ---- Lightweight WhatsApp link ----

async function getWaAuth(key) {
  const row = await first('SELECT value FROM wa_auth WHERE key = ?', [key]);
  return row ? row.value : null;
}

async function setWaAuth(key, value) {
  await query(
    'INSERT INTO wa_auth (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

async function deleteWaAuth(key) {
  await query('DELETE FROM wa_auth WHERE key = ?', [key]);
}

async function clearWaAuth() {
  await query('DELETE FROM wa_auth');
}

async function saveWaContact(phone, name) {
  await query(
    'INSERT INTO wa_contacts (phone, name) VALUES (?, ?) ON CONFLICT (phone) DO UPDATE SET name = excluded.name',
    [phone, name]
  );
}

function getWaContacts() {
  return query('SELECT name, phone FROM wa_contacts ORDER BY name ASC');
}

async function clearWaContacts() {
  await query('DELETE FROM wa_contacts');
}

module.exports = {
  getWaAuth,
  setWaAuth,
  deleteWaAuth,
  clearWaAuth,
  saveWaContact,
  getWaContacts,
  clearWaContacts,
  DEFAULT_TEMPLATE,
  usePostgres,
  init,
  close: () => close(),
  getAllMembers,
  getMemberById,
  addMember,
  updateMember,
  deleteMember,
  getMembersExpiringBetween,
  getSettings,
  saveSettings,
  getReminder,
  getReminderById,
  recordReminder,
  getRecentReminders,
  logRenewal,
  getRecentRenewals,
  hasSession,
  saveSession,
  loadSession,
  deleteSession
};
