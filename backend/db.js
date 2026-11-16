// Storage. Everything belongs to a gym account; every query is scoped by gym id.
// By default data lives in one SQLite file. On hosts without a lasting disk
// (e.g. Render's free plan), set DATABASE_URL to a Postgres database instead.

const path = require('path');

const DEFAULT_TEMPLATE =
  'Hey {first_name}! 👋 Your membership at {gym} expires {when} ({date}). Renew now to keep your streak going: {link}\n\nReply STOP to stop these reminders.';

const usePostgres = !!process.env.DATABASE_URL;

// query(sql, params) -> rows. SQL is written once with '?' placeholders and runs on both.
let query;
let close = async () => {};

const TABLES = (id) => `
  CREATE TABLE IF NOT EXISTS gyms (
    id ${id},
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    payment_url TEXT NOT NULL DEFAULT '',
    message_template TEXT,
    send_hour INTEGER NOT NULL DEFAULT 9,
    renewal_months INTEGER NOT NULL DEFAULT 1,
    theme_color TEXT NOT NULL DEFAULT '',
    theme_mode TEXT NOT NULL DEFAULT 'system',
    logo TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    last_seen_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    gym_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS members (
    id ${id},
    gym_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    membership_end_date TEXT NOT NULL,
    reminders_off INTEGER NOT NULL DEFAULT 0,
    created_at TEXT
  );

  -- One row per member per day: the single reminder that member gets that day.
  CREATE TABLE IF NOT EXISTS reminders (
    id ${id},
    gym_id INTEGER NOT NULL,
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
    gym_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    member_name TEXT,
    old_end_date TEXT NOT NULL,
    new_end_date TEXT NOT NULL,
    renewed_at TEXT NOT NULL
  );

  -- Each gym's WhatsApp link: its sign-in keys and the contacts WhatsApp shared.
  CREATE TABLE IF NOT EXISTS wa_auth (
    gym_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (gym_id, key)
  );

  CREATE TABLE IF NOT EXISTS wa_contacts (
    gym_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (gym_id, phone)
  );
`;

// Tables from the single-gym version. They are set aside, not deleted.
const LEGACY_TABLES = ['members', 'reminders', 'renewals', 'settings', 'wa_auth', 'wa_contacts', 'wa_sessions'];

async function initPostgres() {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  pool.on('error', (err) => console.error('Database connection error:', err.message));
  query = async (sql, params = []) => {
    let n = 0;
    return (await pool.query(sql.replace(/\?/g, () => `$${++n}`), params)).rows;
  };
  close = () => pool.end();

  const exists = async (table) =>
    (await pool.query('SELECT to_regclass($1) AS t', [`public.${table}`])).rows[0].t !== null;
  if (await exists('settings')) {
    await pool.query('CREATE SCHEMA IF NOT EXISTS legacy');
    for (const table of LEGACY_TABLES) {
      if (await exists(table)) await pool.query(`ALTER TABLE public.${table} SET SCHEMA legacy`);
    }
    console.log('Set aside data from the single-gym version (schema "legacy").');
  }
  await pool.query(TABLES('SERIAL PRIMARY KEY'));
}

async function initSqlite() {
  const { DatabaseSync } = require('node:sqlite');
  const dataDir = process.env.GYMPING_DATA_DIR || __dirname;
  const db = new DatabaseSync(process.env.GYMPING_DB || path.join(dataDir, 'gymping.db'));
  query = async (sql, params = []) => db.prepare(sql).all(...params);
  close = async () => db.close();

  db.exec('PRAGMA journal_mode = WAL;');
  const exists = (table) =>
    !!db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (exists('settings')) {
    for (const table of [...LEGACY_TABLES, 'reminders_sent']) {
      if (exists(table)) db.exec(`ALTER TABLE ${table} RENAME TO legacy_${table}`);
    }
    console.log('Set aside data from the single-gym version (tables "legacy_*").');
  }
  db.exec(TABLES('INTEGER PRIMARY KEY AUTOINCREMENT'));
}

// Must finish before anything else is called.
async function init() {
  await (usePostgres ? initPostgres() : initSqlite());
  await query('DELETE FROM sessions WHERE expires_at < ?', [nowIso()]);
}

const nowIso = () => new Date().toISOString();
const first = async (sql, params) => (await query(sql, params))[0];
// Ids arrive from URLs; anything that isn't a whole number matches nothing.
const toId = (id) => (Number.isInteger(Number(id)) ? Number(id) : -1);

// ---- Gym accounts ----

function createGym({ name, email, password_hash, is_admin = 0, status = 'pending' }) {
  return first(
    `INSERT INTO gyms (name, email, password_hash, is_admin, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    [name, email, password_hash, is_admin, status, nowIso()]
  );
}

function getGymByEmail(email) {
  return first('SELECT * FROM gyms WHERE email = ?', [email]);
}

function getGymById(id) {
  return first('SELECT * FROM gyms WHERE id = ?', [toId(id)]);
}

function getActiveGyms() {
  return query("SELECT * FROM gyms WHERE status = 'active' AND is_admin = 0");
}

function updateGymSettings(id, s) {
  return first(
    `UPDATE gyms SET name = ?, payment_url = ?, message_template = ?, send_hour = ?, renewal_months = ?,
       theme_color = ?, theme_mode = ?, logo = ? WHERE id = ? RETURNING *`,
    [s.name, s.payment_url, s.message_template, s.send_hour, s.renewal_months, s.theme_color, s.theme_mode, s.logo, id]
  );
}

function setGymStatus(id, status) {
  return first('UPDATE gyms SET status = ? WHERE id = ? RETURNING *', [status, toId(id)]);
}

async function setGymPassword(id, password_hash) {
  await query('UPDATE gyms SET password_hash = ? WHERE id = ?', [password_hash, toId(id)]);
}

async function touchGym(id) {
  await query('UPDATE gyms SET last_seen_at = ? WHERE id = ?', [nowIso(), id]);
}

// For the overseer: accounts and activity counts only, never member details.
async function listGymsForAdmin(sinceDate) {
  const rows = await query(
    `SELECT g.id, g.name, g.email, g.status, g.created_at, g.last_seen_at,
       (SELECT COUNT(*) FROM members m WHERE m.gym_id = g.id) AS member_count,
       (SELECT COUNT(*) FROM reminders r WHERE r.gym_id = g.id AND r.status = 'sent' AND r.reminder_date >= ?) AS sent_recent,
       (SELECT COUNT(*) FROM reminders r WHERE r.gym_id = g.id AND r.status = 'failed' AND r.reminder_date >= ?) AS failed_recent
     FROM gyms g WHERE g.is_admin = 0 ORDER BY g.created_at DESC`,
    [sinceDate, sinceDate]
  );
  return rows.map((r) => ({
    ...r,
    member_count: Number(r.member_count),
    sent_recent: Number(r.sent_recent),
    failed_recent: Number(r.failed_recent)
  }));
}

// ---- Login sessions ----

async function createSession(token_hash, gym_id, expires_at) {
  await query('INSERT INTO sessions (token_hash, gym_id, expires_at) VALUES (?, ?, ?)', [
    token_hash,
    gym_id,
    expires_at
  ]);
}

function getSessionGym(token_hash) {
  return first(
    `SELECT g.* FROM sessions s JOIN gyms g ON g.id = s.gym_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    [token_hash, nowIso()]
  );
}

async function deleteSession(token_hash) {
  await query('DELETE FROM sessions WHERE token_hash = ?', [token_hash]);
}

async function deleteSessionsForGym(gym_id) {
  await query('DELETE FROM sessions WHERE gym_id = ?', [toId(gym_id)]);
}

// ---- Members ----

function getAllMembers(gymId) {
  return query('SELECT * FROM members WHERE gym_id = ? ORDER BY membership_end_date ASC, name ASC', [gymId]);
}

function getMemberById(gymId, id) {
  return first('SELECT * FROM members WHERE gym_id = ? AND id = ?', [gymId, toId(id)]);
}

function getMemberByPhone(gymId, phone) {
  return first('SELECT * FROM members WHERE gym_id = ? AND phone = ?', [gymId, phone]);
}

function addMember(gymId, m) {
  return first(
    `INSERT INTO members (gym_id, name, phone, membership_end_date, reminders_off, created_at)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    [gymId, m.name, m.phone, m.membership_end_date, m.reminders_off ? 1 : 0, nowIso()]
  );
}

function updateMember(gymId, id, m) {
  return first(
    `UPDATE members SET name = ?, phone = ?, membership_end_date = ?, reminders_off = ?
     WHERE gym_id = ? AND id = ? RETURNING *`,
    [m.name, m.phone, m.membership_end_date, m.reminders_off ? 1 : 0, gymId, toId(id)]
  );
}

async function deleteMember(gymId, id) {
  await query('DELETE FROM members WHERE gym_id = ? AND id = ?', [gymId, toId(id)]);
}

// Members due a reminder: expiring in the window and not opted out.
function getMembersExpiringBetween(gymId, from, to) {
  return query(
    `SELECT * FROM members WHERE gym_id = ? AND reminders_off = 0 AND membership_end_date BETWEEN ? AND ?
     ORDER BY membership_end_date ASC`,
    [gymId, from, to]
  );
}

// A member replied STOP. Returns how many members with that number were switched off.
async function stopRemindersForPhone(gymId, phone) {
  const rows = await query(
    'UPDATE members SET reminders_off = 1 WHERE gym_id = ? AND phone = ? AND reminders_off = 0 RETURNING id',
    [gymId, phone]
  );
  return rows.length;
}

// ---- Reminders ----

function getReminder(member_id, reminder_date) {
  return first('SELECT * FROM reminders WHERE member_id = ? AND reminder_date = ?', [member_id, reminder_date]);
}

function getReminderById(gymId, id) {
  return first('SELECT * FROM reminders WHERE gym_id = ? AND id = ?', [gymId, toId(id)]);
}

// Records the outcome of today's reminder for a member; a repeat attempt updates the same row.
function recordReminder(member, reminder_date, status, message, error) {
  return first(
    `INSERT INTO reminders
       (gym_id, member_id, member_name, phone, membership_end_date, reminder_date, status, error, message, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (member_id, reminder_date) DO UPDATE SET
       member_name = excluded.member_name, phone = excluded.phone,
       membership_end_date = excluded.membership_end_date, status = excluded.status,
       error = excluded.error, message = excluded.message, sent_at = excluded.sent_at,
       attempts = reminders.attempts + 1
     RETURNING *`,
    [
      member.gym_id,
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

function getRecentReminders(gymId, limit) {
  return query('SELECT * FROM reminders WHERE gym_id = ? ORDER BY sent_at DESC LIMIT ?', [gymId, limit]);
}

// ---- Renewals ----

async function logRenewal(member, new_end_date) {
  await query(
    `INSERT INTO renewals (gym_id, member_id, member_name, old_end_date, new_end_date, renewed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [member.gym_id, member.id, member.name, member.membership_end_date, new_end_date, nowIso()]
  );
}

function getRecentRenewals(gymId, limit) {
  return query('SELECT * FROM renewals WHERE gym_id = ? ORDER BY renewed_at DESC LIMIT ?', [gymId, limit]);
}

// ---- WhatsApp link ----

async function getWaAuth(gymId, key) {
  const row = await first('SELECT value FROM wa_auth WHERE gym_id = ? AND key = ?', [gymId, key]);
  return row ? row.value : null;
}

async function setWaAuth(gymId, key, value) {
  await query(
    `INSERT INTO wa_auth (gym_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT (gym_id, key) DO UPDATE SET value = excluded.value`,
    [gymId, key, value]
  );
}

async function deleteWaAuth(gymId, key) {
  await query('DELETE FROM wa_auth WHERE gym_id = ? AND key = ?', [gymId, key]);
}

async function clearWaAuth(gymId) {
  await query('DELETE FROM wa_auth WHERE gym_id = ?', [gymId]);
}

async function saveWaContact(gymId, phone, name) {
  await query(
    `INSERT INTO wa_contacts (gym_id, phone, name) VALUES (?, ?, ?)
     ON CONFLICT (gym_id, phone) DO UPDATE SET name = excluded.name`,
    [gymId, phone, name]
  );
}

function getWaContacts(gymId) {
  return query('SELECT name, phone FROM wa_contacts WHERE gym_id = ? ORDER BY name ASC', [gymId]);
}

async function clearWaContacts(gymId) {
  await query('DELETE FROM wa_contacts WHERE gym_id = ?', [gymId]);
}

module.exports = {
  DEFAULT_TEMPLATE,
  usePostgres,
  init,
  close: () => close(),
  createGym,
  getGymByEmail,
  getGymById,
  getActiveGyms,
  updateGymSettings,
  setGymStatus,
  setGymPassword,
  touchGym,
  listGymsForAdmin,
  createSession,
  getSessionGym,
  deleteSession,
  deleteSessionsForGym,
  getAllMembers,
  getMemberById,
  getMemberByPhone,
  addMember,
  updateMember,
  deleteMember,
  getMembersExpiringBetween,
  stopRemindersForPhone,
  getReminder,
  getReminderById,
  recordReminder,
  getRecentReminders,
  logRenewal,
  getRecentRenewals,
  getWaAuth,
  setWaAuth,
  deleteWaAuth,
  clearWaAuth,
  saveWaContact,
  getWaContacts,
  clearWaContacts
};
