const db = require('./db');
const wa = require('./whatsapp');

const WINDOW_DAYS = 4; // remind daily from this many days before expiry, through expiry day
const QUIET_HOUR = 21; // never start automatic sends at or after 9 PM
const MAX_AUTO_ATTEMPTS = 3; // automatic tries per member per day before waiting for the owner

// ---- Dates (all 'YYYY-MM-DD' strings in the server's time zone, which is India's) ----

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

// Accepts 2026-11-19, 19/11/2026, 19-11-2026 or 19.11.2026 (day first, as written in India).
function parseDate(input) {
  const s = String(input || '').trim();
  if (isValidDate(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isValidDate(iso) ? iso : null;
}

// ---- Phone numbers ----

// Returns '+<digits>' or null. A plain 10-digit number is taken as Indian (+91).
function normalizePhone(input) {
  let digits = String(input || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = `91${digits.slice(1)}`;
  else if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

// ---- Message ----

function buildMessage(template, member, gym, today) {
  const days = daysBetween(today, member.membership_end_date);
  const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  const values = {
    name: member.name,
    first_name: member.name.trim().split(/\s+/)[0],
    gym: gym.name || 'the gym',
    when,
    days: String(Math.max(days, 0)),
    date: formatDate(member.membership_end_date),
    link: gym.payment_url || ''
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

async function sendReminder(gym, member, today) {
  const message = buildMessage(gym.message_template || db.DEFAULT_TEMPLATE, member, gym, today);
  try {
    await wa.sendMessage(gym.id, member.phone, message);
    return await db.recordReminder(member, today, 'sent', message, null);
  } catch (err) {
    const reason = (err && err.message) || String(err);
    console.error(`Gym ${gym.id}: a reminder failed: ${reason}`);
    return await db.recordReminder(member, today, 'failed', message, reason);
  }
}

const running = new Set(); // gym ids with a run in progress

// Sends today's reminder to every member of one gym expiring within the window
// who hasn't had one today. Safe to call repeatedly: it is how missed days and
// WhatsApp outages are caught up. `manual` (the owner pressed the button)
// ignores the send hours and the automatic-attempt limit.
async function runReminders(gymId, { manual = false } = {}) {
  if (running.has(gymId)) return { skipped: 'A reminder run is already in progress' };
  if (!wa.isConnected(gymId)) return { skipped: 'WhatsApp is not connected' };
  let gym = await db.getGymById(gymId);
  if (!gym || gym.status !== 'active') return { skipped: 'This account is not active' };

  const now = new Date();
  if (!manual && (now.getHours() < gym.send_hour || now.getHours() >= QUIET_HOUR)) {
    return { skipped: 'Outside sending hours' };
  }

  running.add(gymId);
  const result = { sent: 0, failed: 0 };
  try {
    const today = localDate(now);
    const due = [];
    for (const m of await db.getMembersExpiringBetween(gymId, today, addDays(today, WINDOW_DAYS))) {
      const r = await db.getReminder(m.id, today);
      if (!r || (r.status === 'failed' && (manual || r.attempts < MAX_AUTO_ATTEMPTS))) due.push(m);
    }

    for (let i = 0; i < due.length; i++) {
      if (i > 0) await sleep(sendGapMs());
      if (!wa.isConnected(gymId)) break; // the rest go out once WhatsApp is back
      // The member, or the gym's settings, may have changed while we waited.
      gym = await db.getGymById(gymId);
      if (!gym || gym.status !== 'active') break;
      const member = await db.getMemberById(gymId, due[i].id);
      if (!member || member.reminders_off) continue;
      const days = daysBetween(today, member.membership_end_date);
      if (days < 0 || days > WINDOW_DAYS) continue;
      const r = await sendReminder(gym, member, today);
      result[r.status === 'sent' ? 'sent' : 'failed']++;
    }
  } finally {
    running.delete(gymId);
  }
  if (result.sent || result.failed) {
    console.log(`Gym ${gymId}: reminder run done, ${result.sent} sent, ${result.failed} failed.`);
  }
  return result;
}

// One pass over every active gym. Gyms run side by side; each paces its own messages.
async function runAll() {
  for (const gym of await db.getActiveGyms()) {
    if (wa.isConnected(gym.id)) {
      runReminders(gym.id).catch((err) => console.error(`Gym ${gym.id}: reminder run failed:`, err.message));
    }
  }
}

module.exports = {
  WINDOW_DAYS,
  localDate,
  isValidDate,
  parseDate,
  addDays,
  addMonths,
  daysBetween,
  normalizePhone,
  buildMessage,
  sendReminder,
  runReminders,
  runAll
};
