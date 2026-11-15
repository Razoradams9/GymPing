const express = require('express');
const cron = require('node-cron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const wa = require('./whatsapp');
const rem = require('./reminders');

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '127.0.0.1';
const PASSWORD = process.env.GYMPING_PASSWORD || '';

const isLocalOnly = ['127.0.0.1', 'localhost', '::1'].includes(HOST);
if (!isLocalOnly && !PASSWORD) {
  console.error(
    'Refusing to start: HOST makes GymPing reachable from other devices, so set GYMPING_PASSWORD too.'
  );
  process.exit(1);
}

const app = express();
app.use(express.json());

// Optional password, required when the app is reachable from other devices.
app.use('/api', (req, res, next) => {
  // Changes must come from the GymPing page itself, not from another website open in the browser.
  if (req.method !== 'GET' && req.get('x-gymping-password') === undefined) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  if (!PASSWORD) return next();
  const given = crypto.createHash('sha256').update(String(req.get('x-gymping-password') || '')).digest();
  const expected = crypto.createHash('sha256').update(PASSWORD).digest();
  if (crypto.timingSafeEqual(given, expected)) return next();
  res.status(401).json({ error: 'Password required' });
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

function withDays(member, today = rem.localDate()) {
  return { ...member, days_remaining: rem.daysBetween(today, member.membership_end_date) };
}

// Validates and cleans a member from a request body. Returns { error } or { value }.
function parseMember(body) {
  const name = String(body.name || '').trim();
  if (!name) return { error: 'Name is required' };
  const phone = rem.normalizePhone(body.phone);
  if (!phone) {
    return { error: 'Phone number looks wrong. Include the country code, e.g. +14155552671' };
  }
  if (!rem.isValidDate(body.membership_end_date)) return { error: 'Membership end date is required' };
  return { value: { name, phone, membership_end_date: body.membership_end_date } };
}

// ---- WhatsApp ----

app.get('/api/status', (req, res) => {
  res.json(wa.getStatus());
});

app.get(
  '/api/contacts',
  wrap(async (req, res) => {
    if (!wa.isConnected()) return res.status(409).json({ error: 'WhatsApp is not connected' });
    res.json(await wa.getContacts());
  })
);

app.post(
  '/api/whatsapp/logout',
  wrap(async (req, res) => {
    await wa.logout();
    res.json({ success: true });
  })
);

// ---- Members ----

app.get('/api/members', (req, res) => {
  const today = rem.localDate();
  res.json(db.getAllMembers().map((m) => withDays(m, today)));
});

app.post('/api/members', (req, res) => {
  const { error, value } = parseMember(req.body);
  if (error) return res.status(400).json({ error });
  res.status(201).json(withDays(db.addMember(value.name, value.phone, value.membership_end_date)));
});

app.put('/api/members/:id', (req, res) => {
  const existing = db.getMemberById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Member not found' });
  const { error, value } = parseMember(req.body);
  if (error) return res.status(400).json({ error });
  // Pushing the end date later is a renewal, however the owner does it.
  if (value.membership_end_date > existing.membership_end_date) {
    db.logRenewal(existing, value.membership_end_date);
  }
  res.json(withDays(db.updateMember(existing.id, value.name, value.phone, value.membership_end_date)));
});

app.delete('/api/members/:id', (req, res) => {
  db.deleteMember(req.params.id);
  res.json({ success: true });
});

// "Renewed" button: extends from the current end date, or from today if already expired.
app.post('/api/members/:id/renew', (req, res) => {
  const member = db.getMemberById(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  const today = rem.localDate();
  const from = member.membership_end_date > today ? member.membership_end_date : today;
  const newEnd = rem.addMonths(from, db.getSettings().renewal_months);
  db.logRenewal(member, newEnd);
  res.json(withDays(db.updateMember(member.id, member.name, member.phone, newEnd), today));
});

// ---- Settings ----

app.get('/api/settings', (req, res) => {
  res.json({ ...db.getSettings(), default_template: db.DEFAULT_TEMPLATE });
});

app.post('/api/settings', (req, res) => {
  const b = req.body;
  const payment_url = String(b.payment_url || '').trim();
  if (payment_url && !/^https?:\/\//i.test(payment_url)) {
    return res.status(400).json({ error: 'Payment link must start with http:// or https://' });
  }
  const send_hour = Number(b.send_hour);
  if (!Number.isInteger(send_hour) || send_hour < 0 || send_hour > 20) {
    return res.status(400).json({ error: 'Send time must be between 12 AM and 8 PM' });
  }
  const renewal_months = Number(b.renewal_months);
  if (!Number.isInteger(renewal_months) || renewal_months < 1 || renewal_months > 36) {
    return res.status(400).json({ error: 'Renewal length must be 1 to 36 months' });
  }
  const saved = db.saveSettings({
    gym_name: String(b.gym_name || '').trim() || 'My Gym',
    payment_url,
    message_template: String(b.message_template || '').trim() || null,
    send_hour,
    renewal_months
  });
  res.json({ ...saved, default_template: db.DEFAULT_TEMPLATE });
});

// ---- Reminders & renewals ----

app.get('/api/reminders', (req, res) => {
  res.json({ today: rem.localDate(), reminders: db.getRecentReminders(100) });
});

app.get('/api/renewals', (req, res) => {
  res.json(db.getRecentRenewals(50));
});

// "Send now" button. Sends happen in the background (they are spaced out).
app.post('/api/reminders/run', (req, res) => {
  if (!wa.isConnected()) return res.status(409).json({ error: 'WhatsApp is not connected' });
  rem.runReminders({ manual: true }).catch((err) => console.error('Reminder run failed:', err));
  res.status(202).json({ started: true });
});

// "Try again" on a reminder that failed today.
app.post(
  '/api/reminders/:id/retry',
  wrap(async (req, res) => {
    const reminder = db.getReminderById(req.params.id);
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    const today = rem.localDate();
    if (reminder.status === 'sent' || reminder.reminder_date !== today) {
      return res.status(409).json({ error: 'Only a reminder that failed today can be retried' });
    }
    const member = db.getMemberById(reminder.member_id);
    if (!member) return res.status(404).json({ error: 'This member was removed' });
    if (!wa.isConnected()) return res.status(409).json({ error: 'WhatsApp is not connected' });
    res.json(await rem.sendReminder(member, today));
  })
);

// ---- Turning GymPing off ----

async function shutdown() {
  console.log('GymPing is shutting down.');
  setTimeout(() => process.exit(0), 8000).unref(); // don't hang if the browser won't close
  await wa.stop();
  process.exit(0);
}

app.post('/api/shutdown', (req, res) => {
  res.json({ success: true });
  shutdown();
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ---- Dashboard app (after `npm run build` in frontend) ----

const dist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Something went wrong' });
});

// ---- Scheduler ----
// Checked every 10 minutes rather than once a day, so reminders missed while
// the computer was off or WhatsApp was disconnected go out as soon as possible.

const tick = () => rem.runReminders().catch((err) => console.error('Reminder run failed:', err));
cron.schedule('*/10 * * * *', tick);
wa.onReady(tick);

const server = app.listen(PORT, HOST, () => {
  console.log(`GymPing running at http://${isLocalOnly ? 'localhost' : HOST}:${PORT}`);
  wa.start();
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`GymPing is already running (port ${PORT} is in use). Open http://localhost:${PORT}`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});
