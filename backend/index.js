// GymPing runs for gyms in India: send hours and "4 days before" follow Indian time.
process.env.TZ = process.env.TZ || 'Asia/Kolkata';

const express = require('express');
const cron = require('node-cron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const auth = require('./auth');
const wa = require('./whatsapp');
const rem = require('./reminders');

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '127.0.0.1';
const isLocalOnly = ['127.0.0.1', 'localhost', '::1'].includes(HOST);

// The overseer account. When set, new gyms wait for the overseer's approval;
// when not set (e.g. trying GymPing on your own computer), sign-ups are active at once.
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const approvalRequired = !!ADMIN_EMAIL;

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

// For the host's health checks; reveals nothing.
app.get('/healthz', (req, res) => res.send('ok'));

app.use('/api', auth.sameSite);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// ---- Accounts ----

const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;

app.post(
  '/api/auth/signup',
  wrap(async (req, res) => {
    const name = String(req.body.gym_name || '').trim().slice(0, 80);
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!name) return res.status(400).json({ error: 'Enter your gym name' });
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (!req.body.agree) {
      return res.status(400).json({ error: 'Please accept the Terms and Privacy Policy' });
    }
    if (email === ADMIN_EMAIL || (await db.getGymByEmail(email))) {
      return res.status(409).json({ error: 'An account with this email already exists. Log in instead.' });
    }
    const gym = await db.createGym({
      name,
      email,
      password_hash: await auth.hashPassword(password),
      status: approvalRequired ? 'pending' : 'active'
    });
    await auth.startSession(req, res, gym);
    res.status(201).json(auth.publicGym(gym));
  })
);

app.post(
  '/api/auth/login',
  wrap(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const key = `${req.ip}|${email}`;
    if (auth.isLocked(key)) {
      return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    }
    const gym = await db.getGymByEmail(email);
    if (!gym || !(await auth.verifyPassword(password, gym.password_hash))) {
      auth.recordFailure(key);
      return res.status(401).json({ error: 'Wrong email or password' });
    }
    auth.clearFailures(key);
    await auth.startSession(req, res, gym);
    res.json(auth.publicGym(gym));
  })
);

app.post(
  '/api/auth/logout',
  wrap(async (req, res) => {
    await auth.endSession(req, res);
    res.json({ success: true });
  })
);

app.get(
  '/api/auth/me',
  auth.loggedIn,
  wrap(async (req, res) => {
    await db.touchGym(req.gym.id);
    res.json(auth.publicGym(req.gym));
  })
);

app.post(
  '/api/auth/password',
  auth.loggedIn,
  wrap(async (req, res) => {
    const next = String(req.body.new_password || '');
    if (!(await auth.verifyPassword(String(req.body.current_password || ''), req.gym.password_hash))) {
      return res.status(400).json({ error: 'Current password is wrong' });
    }
    if (next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
    await db.setGymPassword(req.gym.id, await auth.hashPassword(next));
    res.json({ success: true });
  })
);

// ---- Overseer ----
// Sees accounts and activity counts. Member names, numbers and messages are never sent here.

const overseer = [auth.loggedIn, auth.admin];

app.get(
  '/api/admin/gyms',
  overseer,
  wrap(async (req, res) => {
    const since = rem.addDays(rem.localDate(), -30);
    const gyms = await db.listGymsForAdmin(since);
    res.json(gyms.map((g) => ({ ...g, whatsapp_connected: wa.isConnected(g.id) })));
  })
);

app.post(
  '/api/admin/gyms/:id/status',
  overseer,
  wrap(async (req, res) => {
    const status = req.body.status;
    if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'Unknown status' });
    const target = await db.getGymById(req.params.id);
    if (!target || target.is_admin) return res.status(404).json({ error: 'Gym not found' });
    await db.setGymStatus(target.id, status);
    if (status === 'suspended') await wa.stopLink(target.id);
    res.json({ success: true });
  })
);

// For an owner who forgot their password: sets a temporary one to pass on to them.
app.post(
  '/api/admin/gyms/:id/reset-password',
  overseer,
  wrap(async (req, res) => {
    const target = await db.getGymById(req.params.id);
    if (!target || target.is_admin) return res.status(404).json({ error: 'Gym not found' });
    const temp = crypto.randomBytes(9).toString('base64url');
    await db.setGymPassword(target.id, await auth.hashPassword(temp));
    await db.deleteSessionsForGym(target.id);
    res.json({ temp_password: temp });
  })
);

// ---- Everything below belongs to one logged-in, active gym ----

const gym = [auth.loggedIn, auth.activeGym];

function withDays(member, today = rem.localDate()) {
  return {
    ...member,
    reminders_off: !!member.reminders_off,
    days_remaining: rem.daysBetween(today, member.membership_end_date)
  };
}

// Validates and cleans a member from a request body or import row. Returns { error } or { value }.
function parseMember(body) {
  const name = String(body.name || '').trim().slice(0, 120);
  if (!name) return { error: 'Name is required' };
  const phone = rem.normalizePhone(body.phone);
  if (!phone) return { error: 'Phone number looks wrong. Use 10 digits, or include the country code.' };
  const membership_end_date = rem.parseDate(body.membership_end_date);
  if (!membership_end_date) return { error: 'Membership end date is missing or not a date' };
  return { value: { name, phone, membership_end_date, reminders_off: !!body.reminders_off } };
}

// ---- WhatsApp ----

app.get('/api/status', gym, (req, res) => {
  res.json(wa.getStatus(req.gym.id));
});

app.get(
  '/api/contacts',
  gym,
  wrap(async (req, res) => {
    if (!wa.isConnected(req.gym.id)) return res.status(409).json({ error: 'WhatsApp is not connected' });
    res.json(await wa.getContacts(req.gym.id));
  })
);

app.post(
  '/api/whatsapp/logout',
  gym,
  wrap(async (req, res) => {
    await wa.logout(req.gym.id);
    res.json({ success: true });
  })
);

// ---- Members ----

app.get(
  '/api/members',
  gym,
  wrap(async (req, res) => {
    const today = rem.localDate();
    res.json((await db.getAllMembers(req.gym.id)).map((m) => withDays(m, today)));
  })
);

app.post(
  '/api/members',
  gym,
  wrap(async (req, res) => {
    const { error, value } = parseMember(req.body);
    if (error) return res.status(400).json({ error });
    res.status(201).json(withDays(await db.addMember(req.gym.id, value)));
  })
);

// Spreadsheet import. A row whose phone number already exists updates that member.
app.post(
  '/api/members/import',
  gym,
  wrap(async (req, res) => {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (rows.length === 0) return res.status(400).json({ error: 'The file has no rows' });
    if (rows.length > 5000) return res.status(400).json({ error: 'Import up to 5,000 members at a time' });
    const result = { added: 0, updated: 0, errors: [] };
    for (let i = 0; i < rows.length; i++) {
      const { error, value } = parseMember(rows[i] || {});
      if (error) {
        result.errors.push({ row: i + 1, error });
        continue;
      }
      const existing = await db.getMemberByPhone(req.gym.id, value.phone);
      if (existing) {
        await db.updateMember(req.gym.id, existing.id, { ...value, reminders_off: existing.reminders_off });
        result.updated++;
      } else {
        await db.addMember(req.gym.id, value);
        result.added++;
      }
    }
    res.json(result);
  })
);

app.get(
  '/api/members/export',
  gym,
  wrap(async (req, res) => {
    // Quote every cell; neutralise cells a spreadsheet would run as a formula.
    const cell = (v) => {
      const s = String(v ?? '');
      return `"${(/^[=\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const lines = [['Name', 'Phone', 'Membership end date', 'Reminders'].map(cell).join(',')];
    for (const m of await db.getAllMembers(req.gym.id)) {
      lines.push([m.name, m.phone, m.membership_end_date, m.reminders_off ? 'off' : 'on'].map(cell).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="gymping-members-${rem.localDate()}.csv"`);
    res.send(`﻿${lines.join('\r\n')}\r\n`);
  })
);

app.put(
  '/api/members/:id',
  gym,
  wrap(async (req, res) => {
    const existing = await db.getMemberById(req.gym.id, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Member not found' });
    const { error, value } = parseMember(req.body);
    if (error) return res.status(400).json({ error });
    // Pushing the end date later is a renewal, however the owner does it.
    if (value.membership_end_date > existing.membership_end_date) {
      await db.logRenewal(existing, value.membership_end_date);
    }
    res.json(withDays(await db.updateMember(req.gym.id, existing.id, value)));
  })
);

app.delete(
  '/api/members/:id',
  gym,
  wrap(async (req, res) => {
    await db.deleteMember(req.gym.id, req.params.id);
    res.json({ success: true });
  })
);

// "Renewed" button: extends from the current end date, or from today if already expired.
app.post(
  '/api/members/:id/renew',
  gym,
  wrap(async (req, res) => {
    const member = await db.getMemberById(req.gym.id, req.params.id);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    const today = rem.localDate();
    const from = member.membership_end_date > today ? member.membership_end_date : today;
    const newEnd = rem.addMonths(from, req.gym.renewal_months);
    await db.logRenewal(member, newEnd);
    const updated = await db.updateMember(req.gym.id, member.id, { ...member, membership_end_date: newEnd });
    res.json(withDays(updated, today));
  })
);

// ---- Settings ----

const LOGO_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

app.post(
  '/api/settings',
  gym,
  wrap(async (req, res) => {
    const b = req.body;
    const name = String(b.name || '').trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: 'Gym name is required' });
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
    const theme_color = String(b.theme_color || '');
    if (theme_color && !/^#[0-9a-f]{6}$/i.test(theme_color)) {
      return res.status(400).json({ error: 'Theme colour is not a valid colour' });
    }
    const theme_mode = ['system', 'light', 'dark'].includes(b.theme_mode) ? b.theme_mode : 'system';
    const logo = String(b.logo || '');
    if (logo && (logo.length > 150000 || !LOGO_PATTERN.test(logo))) {
      return res.status(400).json({ error: 'Logo must be a small PNG, JPEG or WebP image' });
    }
    const saved = await db.updateGymSettings(req.gym.id, {
      name,
      payment_url,
      message_template: String(b.message_template || '').trim().slice(0, 1500) || null,
      send_hour,
      renewal_months,
      theme_color,
      theme_mode,
      logo
    });
    res.json(auth.publicGym(saved));
  })
);

// ---- Reminders & renewals ----

app.get(
  '/api/reminders',
  gym,
  wrap(async (req, res) => {
    res.json({ today: rem.localDate(), reminders: await db.getRecentReminders(req.gym.id, 100) });
  })
);

app.get(
  '/api/renewals',
  gym,
  wrap(async (req, res) => {
    res.json(await db.getRecentRenewals(req.gym.id, 50));
  })
);

// "Send now" button. Sends happen in the background (they are spaced out).
app.post('/api/reminders/run', gym, (req, res) => {
  if (!wa.isConnected(req.gym.id)) return res.status(409).json({ error: 'WhatsApp is not connected' });
  rem
    .runReminders(req.gym.id, { manual: true })
    .catch((err) => console.error(`Gym ${req.gym.id}: reminder run failed:`, err.message));
  res.status(202).json({ started: true });
});

// "Try again" on a reminder that failed today.
app.post(
  '/api/reminders/:id/retry',
  gym,
  wrap(async (req, res) => {
    const reminder = await db.getReminderById(req.gym.id, req.params.id);
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    const today = rem.localDate();
    if (reminder.status === 'sent' || reminder.reminder_date !== today) {
      return res.status(409).json({ error: 'Only a reminder that failed today can be retried' });
    }
    const member = await db.getMemberById(req.gym.id, reminder.member_id);
    if (!member) return res.status(404).json({ error: 'This member was removed' });
    if (!wa.isConnected(req.gym.id)) return res.status(409).json({ error: 'WhatsApp is not connected' });
    res.json(await rem.sendReminder(req.gym, member, today));
  })
);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ---- Dashboard app (after `npm run build` in frontend) ----

const dist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

// ---- A member replied STOP ----

wa.onStopRequest(async (gymId, phone) => {
  const stopped = await db.stopRemindersForPhone(gymId, phone);
  if (!stopped) return; // not one of this gym's members; say nothing
  const g = await db.getGymById(gymId);
  console.log(`Gym ${gymId}: a member opted out of reminders.`);
  await wa.sendMessage(gymId, phone, `You won't get any more reminders from ${g.name}.`);
});

// ---- Scheduler ----
// Checked every 10 minutes rather than once a day, so reminders missed while
// the server was down or WhatsApp was disconnected go out as soon as possible.

cron.schedule('*/10 * * * *', () => rem.runAll().catch((err) => console.error('Reminder pass failed:', err.message)));
wa.onReady((gymId) => rem.runReminders(gymId));

// Render's free plan puts the app to sleep after 15 minutes without visitors,
// which would stop reminders. Visiting our own address keeps it awake.
if (process.env.RENDER_EXTERNAL_URL) {
  const ping = () => fetch(`${process.env.RENDER_EXTERNAL_URL}/healthz`).catch(() => {});
  setInterval(ping, 10 * 60 * 1000);
}

// ---- Start and stop ----

const pidFile = path.join(__dirname, 'gymping.pid');

async function shutdown() {
  console.log('GymPing is shutting down.');
  setTimeout(() => process.exit(0), 8000).unref(); // don't hang if a connection won't close
  fs.rmSync(pidFile, { force: true });
  await wa.stopAll();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function ensureOverseer() {
  if (!ADMIN_EMAIL) return;
  if (ADMIN_PASSWORD.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters');
  const password_hash = await auth.hashPassword(ADMIN_PASSWORD);
  const existing = await db.getGymByEmail(ADMIN_EMAIL);
  if (existing && !existing.is_admin) throw new Error('ADMIN_EMAIL is already used by a gym account');
  if (existing) await db.setGymPassword(existing.id, password_hash);
  else await db.createGym({ name: 'Overseer', email: ADMIN_EMAIL, password_hash, is_admin: 1, status: 'active' });
}

db.init()
  .then(ensureOverseer)
  .then(() => {
    const server = app.listen(PORT, HOST, () => {
      console.log(`GymPing running at http://${isLocalOnly ? 'localhost' : HOST}:${PORT}`);
      if (!approvalRequired) console.log('No ADMIN_EMAIL set: new gym accounts are active without approval.');
      fs.writeFileSync(pidFile, String(process.pid));
      wa.startLinked().catch((err) => console.error('Could not reconnect WhatsApp links:', err.message));
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`GymPing is already running (port ${PORT} is in use). Open http://localhost:${PORT}`);
      } else {
        console.error(err.message);
      }
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error('GymPing could not start:', err.message);
    process.exit(1);
  });
