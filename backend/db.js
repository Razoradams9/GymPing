const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'gymping.db'));

// Enable WAL mode for better performance
db.exec('PRAGMA journal_mode = WAL;');

// Create tables
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

  CREATE TABLE IF NOT EXISTS reminders_sent (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    sent_at TEXT DEFAULT (datetime('now')),
    membership_end_date TEXT
  );
`);

// Insert default settings row if none exists
const existingSettings = db.prepare('SELECT id FROM settings WHERE id = 1').get();
if (!existingSettings) {
  db.prepare("INSERT INTO settings (id, gym_name, payment_url) VALUES (1, 'My Gym', '')").run();
}

function getAllMembers() {
  return db.prepare('SELECT * FROM members ORDER BY membership_end_date ASC').all();
}

function getMemberById(id) {
  return db.prepare('SELECT * FROM members WHERE id = ?').get(id);
}

function addMember(name, phone, membership_end_date) {
  const result = db.prepare(
    'INSERT INTO members (name, phone, membership_end_date) VALUES (?, ?, ?)'
  ).run(name, phone, membership_end_date);
  return getMemberById(result.lastInsertRowid);
}

function updateMember(id, name, phone, membership_end_date) {
  db.prepare(
    'UPDATE members SET name = ?, phone = ?, membership_end_date = ? WHERE id = ?'
  ).run(name, phone, membership_end_date, id);
  return getMemberById(id);
}

function deleteMember(id) {
  return db.prepare('DELETE FROM members WHERE id = ?').run(id);
}

function getSettings() {
  return db.prepare('SELECT * FROM settings WHERE id = 1').get();
}

function saveSettings(gym_name, payment_url) {
  db.prepare(
    'INSERT OR REPLACE INTO settings (id, gym_name, payment_url) VALUES (1, ?, ?)'
  ).run(gym_name, payment_url);
  return getSettings();
}

function getMembersExpiringOn(date_string) {
  return db.prepare('SELECT * FROM members WHERE membership_end_date = ?').all(date_string);
}

function hasReminderBeenSent(member_id, membership_end_date) {
  const row = db.prepare(
    'SELECT id FROM reminders_sent WHERE member_id = ? AND membership_end_date = ?'
  ).get(member_id, membership_end_date);
  return !!row;
}

function logReminder(member_id, membership_end_date) {
  return db.prepare(
    'INSERT INTO reminders_sent (member_id, membership_end_date) VALUES (?, ?)'
  ).run(member_id, membership_end_date);
}

function getRecentReminders(limit) {
  return db.prepare(
    `SELECT r.*, m.name, m.phone
     FROM reminders_sent r
     LEFT JOIN members m ON r.member_id = m.id
     ORDER BY r.sent_at DESC
     LIMIT ?`
  ).all(limit);
}

module.exports = {
  getAllMembers,
  getMemberById,
  addMember,
  updateMember,
  deleteMember,
  getSettings,
  saveSettings,
  getMembersExpiringOn,
  hasReminderBeenSent,
  logReminder,
  getRecentReminders
};
