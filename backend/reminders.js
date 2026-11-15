const db = require('./db');
const wa = require('./whatsapp');

const WINDOW_DAYS = 4; // remind daily from this many days before expiry, through expiry day
const QUIET_HOUR = 21; // never start automatic sends at or after 9 PM
const MAX_AUTO_ATTEMPTS = 3; // automatic tries per member per day before waiting for the owner

// ---- Dates (all 'YYYY-MM-DD' strings in the computer's local time) ----

function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Jan 31 + 1 month = Feb 28/29, not Mar 3.
function addMonths(dateStr, n) {
  const [y, m, day] = dateStr.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return first.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function formatDate(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

// ---- Phone numbers ----

// Returns '+<digits>' or null. Numbers typed without '+' get the gym's country code.
function normalizePhone(input, defaultCountryCode) {
  const raw = String(input || '').trim();
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else {
    const cc = String(defaultCountryCode || '').replace(/\D/g, '');
    if (cc) digits = cc + digits.replace(/^0+/, '');
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

// ---- Message ----

function buildMessage(template, member, settings, today) {
  const days = daysBetween(today, member.membership_end_date);
  const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  const values = {
    name: member.name,
    first_name: member.name.trim().split(/\s+/)[0],
    gym: settings.gym_name || 'the gym',
    when,
    days: String(Math.max(days, 0)),
    date: formatDate(member.membership_end_date),
    link: settings.payment_url || ''
  };
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? values[key] : match)).trim();
}

// ---- Sending ----

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Pause between messages so WhatsApp doesn't see a burst of automated sends.
function sendGapMs() {
  if (process.env.GYMPING_SEND_GAP_MS !== undefined) return Number(process.env.GYMPING_SEND_GAP_MS);
  return 20000 + Math.random() * 40000;
}

async function sendReminder(member, today) {
  const settings = db.getSettings();
  const message = buildMessage(settings.message_template, member, settings, today);
  try {
    await wa.sendMessage(member.phone, message);
    console.log(`Reminder sent to ${member.name} (${member.phone})`);
    return db.recordReminder(member, today, 'sent', message, null);
  } catch (err) {
    console.error(`Reminder to ${member.name} failed: ${err.message}`);
    return db.recordReminder(member, today, 'failed', message, err.message);
  }
}

let running = false;

// Sends today's reminder to every member expiring within the window who hasn't
// had one today. Safe to call repeatedly: it is how missed days and WhatsApp
// outages are caught up. `manual` (the owner pressed the button) ignores the
// send hours and the automatic-attempt limit.
async function runReminders({ manual = false } = {}) {
  if (running) return { skipped: 'A reminder run is already in progress' };
  if (!wa.isConnected()) return { skipped: 'WhatsApp is not connected' };

  const now = new Date();
  const { send_hour } = db.getSettings();
  if (!manual && (now.getHours() < send_hour || now.getHours() >= QUIET_HOUR)) {
    return { skipped: 'Outside sending hours' };
  }

  running = true;
  const result = { sent: 0, failed: 0 };
  try {
    const today = localDate(now);
    const due = db.getMembersExpiringBetween(today, addDays(today, WINDOW_DAYS)).filter((m) => {
      const r = db.getReminder(m.id, today);
      return !r || (r.status === 'failed' && (manual || r.attempts < MAX_AUTO_ATTEMPTS));
    });

    for (let i = 0; i < due.length; i++) {
      if (i > 0) await sleep(sendGapMs());
      if (!wa.isConnected()) break; // the rest go out once WhatsApp is back
      // The member may have been renewed, edited or removed while we waited.
      const member = db.getMemberById(due[i].id);
      if (!member) continue;
      const days = daysBetween(today, member.membership_end_date);
      if (days < 0 || days > WINDOW_DAYS) continue;
      const r = await sendReminder(member, today);
      result[r.status === 'sent' ? 'sent' : 'failed']++;
    }
  } finally {
    running = false;
  }
  if (result.sent || result.failed) {
    console.log(`Reminder run done: ${result.sent} sent, ${result.failed} failed.`);
  }
  return result;
}

module.exports = {
  WINDOW_DAYS,
  localDate,
  isValidDate,
  addDays,
  addMonths,
  daysBetween,
  normalizePhone,
  buildMessage,
  sendReminder,
  runReminders
};
