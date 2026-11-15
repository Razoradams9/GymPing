const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DEFAULT_TEMPLATE =
  'Hey {first_name}! 👋 Your membership at {gym} expires {when} ({date}). Renew now to keep your streak going: {link}';

const db = new DatabaseSync(process.env.GYMPING_DB || path.join(__dirname, 'gymping.db'));

db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    membership_end_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payment_url TEXT,
    gym_name TEXT
  );

  -- One row per member per day: the single reminder that member gets that day.
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    member_name TEXT,
    old_end_date TEXT NOT NULL,
    new_end_date TEXT NOT NULL,
    renewed_at TEXT NOT NULL
  );
`);

// Settings columns added after the first release.
const settingsColumns = db.prepare('PRAGMA table_info(settings)').all().map((c) => c.name);
const newSettingsColumns = {
  message_template: 'TEXT',
  send_hour: 'INTEGER NOT NULL DEFAULT 9',
  default_country_code: "TEXT NOT NULL DEFAULT ''",
  renewal_months: 'INTEGER NOT NULL DEFAULT 1'
};
for (const [name, type] of Object.entries(newSettingsColumns)) {
  if (!settingsColumns.includes(name)) db.exec(`ALTER TABLE settings ADD COLUMN ${name} ${type}`);
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

if (!db.prepare('SELECT id FROM settings WHERE id = 1').get()) {
  db.prepare("INSERT INTO settings (id, gym_name, payment_url) VALUES (1, 'My Gym', '')").run();
}

function nowIso() {
  return new Date().toISOString();
}

// ---- Members ----

function getAllMembers() {
  return db.prepare('SELECT * FROM members ORDER BY membership_end_date ASC, name ASC').all();
}

function getMemberById(id) {
  return db.prepare('SELECT * FROM members WHERE id = ?').get(id);
}

function addMember(name, phone, membership_end_date) {
  const result = db
    .prepare('INSERT INTO members (name, phone, membership_end_date) VALUES (?, ?, ?)')
    .run(name, phone, membership_end_date);
  return getMemberById(result.lastInsertRowid);
}

function updateMember(id, name, phone, membership_end_date) {
  db.prepare('UPDATE members SET name = ?, phone = ?, membership_end_date = ? WHERE id = ?').run(
    name,
    phone,
    membership_end_date,
    id
  );
  return getMemberById(id);
}

function deleteMember(id) {
  return db.prepare('DELETE FROM members WHERE id = ?').run(id);
}

function getMembersExpiringBetween(from, to) {
  return db
    .prepare(
      'SELECT * FROM members WHERE membership_end_date BETWEEN ? AND ? ORDER BY membership_end_date ASC'
    )
    .all(from, to);
}

// ---- Settings ----

function getSettings() {
  const s = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  return { ...s, message_template: s.message_template || DEFAULT_TEMPLATE };
}

function saveSettings(s) {
  db.prepare(
    `UPDATE settings SET gym_name = ?, payment_url = ?, message_template = ?, send_hour = ?,
       default_country_code = ?, renewal_months = ? WHERE id = 1`
  ).run(
    s.gym_name,
    s.payment_url,
    s.message_template,
    s.send_hour,
    s.default_country_code,
    s.renewal_months
  );
  return getSettings();
}

// ---- Reminders ----

function getReminder(member_id, reminder_date) {
  return db
    .prepare('SELECT * FROM reminders WHERE member_id = ? AND reminder_date = ?')
    .get(member_id, reminder_date);
}

function getReminderById(id) {
  return db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
}

// Records the outcome of today's reminder for a member; a repeat attempt updates the same row.
function recordReminder(member, reminder_date, status, message, error) {
  db.prepare(
    `INSERT INTO reminders
       (member_id, member_name, phone, membership_end_date, reminder_date, status, error, message, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (member_id, reminder_date) DO UPDATE SET
       member_name = excluded.member_name, phone = excluded.phone,
       membership_end_date = excluded.membership_end_date, status = excluded.status,
       error = excluded.error, message = excluded.message, sent_at = excluded.sent_at,
       attempts = attempts + 1`
  ).run(
    member.id,
    member.name,
    member.phone,
    member.membership_end_date,
    reminder_date,
    status,
    error || null,
    message,
    nowIso()
  );
  return getReminder(member.id, reminder_date);
}

function getRecentReminders(limit) {
  return db.prepare('SELECT * FROM reminders ORDER BY sent_at DESC LIMIT ?').all(limit);
}

// ---- Renewals ----

function logRenewal(member, new_end_date) {
  db.prepare(
    'INSERT INTO renewals (member_id, member_name, old_end_date, new_end_date, renewed_at) VALUES (?, ?, ?, ?, ?)'
  ).run(member.id, member.name, member.membership_end_date, new_end_date, nowIso());
}

function getRecentRenewals(limit) {
  return db.prepare('SELECT * FROM renewals ORDER BY renewed_at DESC LIMIT ?').all(limit);
}

module.exports = {
  DEFAULT_TEMPLATE,
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
  getRecentRenewals
};
