const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Runs against SQLite by default, or Postgres when DATABASE_URL points at an empty database.
process.env.GYMPING_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gymping-')), 'test.db');
process.env.GYMPING_FAKE_WA = '1';
process.env.GYMPING_SEND_GAP_MS = '0';

const db = require('../db');
const wa = require('../whatsapp');
const rem = require('../reminders');
const auth = require('../auth');

const today = rem.localDate();
let gymA;
let gymB;

async function makeGym(name, status = 'active') {
  return db.createGym({ name, email: `${name.toLowerCase()}@example.com`, password_hash: 'x', status });
}

async function linked(gym) {
  wa.getStatus(gym.id); // starts the (fake) link
  for (let i = 0; i < 50 && !wa.isConnected(gym.id); i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(wa.isConnected(gym.id));
}

const member = (name, phone, days, extra = {}) => ({
  name,
  phone,
  membership_end_date: rem.addDays(today, days),
  ...extra
});

test.before(async () => {
  await db.init();
  gymA = await makeGym('Alpha');
  gymB = await makeGym('Bravo');
  await linked(gymA);
  await linked(gymB);
});

test.after(async () => {
  await wa.stopAll();
  await db.close();
});

test('date helpers', () => {
  assert.equal(rem.addDays('2026-12-30', 4), '2027-01-03');
  assert.equal(rem.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(rem.addMonths('2026-11-19', 2), '2027-01-19');
  assert.equal(rem.daysBetween('2026-11-15', '2026-11-19'), 4);
  assert.equal(rem.isValidDate('2026-02-30'), false);
  assert.equal(rem.parseDate('19/11/2026'), '2026-11-19');
  assert.equal(rem.parseDate('5-1-2027'), '2027-01-05');
  assert.equal(rem.parseDate('2026-11-19'), '2026-11-19');
  assert.equal(rem.parseDate('31/02/2026'), null);
  assert.equal(rem.parseDate('next week'), null);
});

test('phone numbers default to India', () => {
  assert.equal(rem.normalizePhone('98765 43210'), '+919876543210');
  assert.equal(rem.normalizePhone('098765 43210'), '+919876543210');
  assert.equal(rem.normalizePhone('+91 98765-43210'), '+919876543210');
  assert.equal(rem.normalizePhone('+1 (415) 555-2671'), '+14155552671');
  assert.equal(rem.normalizePhone('0044 7911 123456'), '+447911123456');
  assert.equal(rem.normalizePhone('12345'), null);
});

test('message wording', () => {
  const gym = { name: 'FitZone', payment_url: 'https://pay.example/renew' };
  const m = { name: 'Sarah Khan', membership_end_date: '2026-11-19' };
  assert.equal(
    rem.buildMessage('Hey {first_name}! Your membership at {gym} expires {when} ({date}). Renew: {link}', m, gym, '2026-11-15'),
    'Hey Sarah! Your membership at FitZone expires in 4 days (Nov 19). Renew: https://pay.example/renew'
  );
  assert.match(db.DEFAULT_TEMPLATE, /Reply STOP/);
  assert.equal(rem.buildMessage('{when}', m, gym, '2026-11-18'), 'tomorrow');
  assert.equal(rem.buildMessage('{when} {oops}', m, gym, '2026-11-19'), 'today {oops}');
});

test('passwords', async () => {
  const hash = await auth.hashPassword('correct horse');
  assert.equal(await auth.verifyPassword('correct horse', hash), true);
  assert.equal(await auth.verifyPassword('wrong', hash), false);
  assert.equal(await auth.verifyPassword('anything', 'x'), false);
});

test('one reminder per member per day, only inside the 4-day window', async () => {
  const inWindow = await db.addMember(gymA.id, member('In Window', '+14155550101', 4));
  const lastDay = await db.addMember(gymA.id, member('Last Day', '+14155550102', 0));
  const tooEarly = await db.addMember(gymA.id, member('Too Early', '+14155550103', 5));
  const expired = await db.addMember(gymA.id, member('Expired', '+14155550104', -1));
  const optedOut = await db.addMember(gymA.id, member('Opted Out', '+14155550106', 2, { reminders_off: true }));

  assert.deepEqual(await rem.runReminders(gymA.id, { manual: true }), { sent: 2, failed: 0 });
  assert.equal((await db.getReminder(inWindow.id, today)).status, 'sent');
  assert.equal((await db.getReminder(lastDay.id, today)).status, 'sent');
  for (const m of [tooEarly, expired, optedOut]) assert.equal(await db.getReminder(m.id, today), undefined);

  // Running again the same day sends nothing more.
  assert.deepEqual(await rem.runReminders(gymA.id, { manual: true }), { sent: 0, failed: 0 });
});

test('failed sends are logged, retried, and fixed by correcting the number', async () => {
  const bad = await db.addMember(gymA.id, member('Bad Number', '+14155550000', 2));
  assert.deepEqual(await rem.runReminders(gymA.id, { manual: true }), { sent: 0, failed: 1 });
  let r = await db.getReminder(bad.id, today);
  assert.equal(r.status, 'failed');
  assert.match(r.error, /not on WhatsApp/);

  await db.updateMember(gymA.id, bad.id, { ...bad, phone: '+14155550105' });
  assert.deepEqual(await rem.runReminders(gymA.id, { manual: true }), { sent: 1, failed: 0 });
  r = await db.getReminder(bad.id, today);
  assert.equal(r.status, 'sent');
  assert.equal(r.attempts, 2);
  assert.equal(r.error, null);
});

test('gyms cannot see or change each other', async () => {
  const theirs = await db.addMember(gymB.id, member('Bravo Member', '+14155550201', 3));
  const mine = (await db.getAllMembers(gymA.id))[0];

  assert.equal((await db.getAllMembers(gymB.id)).length, 1);
  assert.equal(await db.getMemberById(gymA.id, theirs.id), undefined);
  assert.equal(await db.updateMember(gymA.id, theirs.id, { ...theirs, name: 'Hijacked' }), undefined);
  await db.deleteMember(gymA.id, theirs.id);
  assert.equal((await db.getMemberById(gymB.id, theirs.id)).name, 'Bravo Member');

  // Bravo's run only messages Bravo's member, and each gym only sees its own log.
  assert.deepEqual(await rem.runReminders(gymB.id, { manual: true }), { sent: 1, failed: 0 });
  const logB = await db.getRecentReminders(gymB.id, 100);
  assert.deepEqual(logB.map((r) => r.member_name), ['Bravo Member']);
  assert.ok((await db.getRecentReminders(gymA.id, 100)).every((r) => r.member_name !== 'Bravo Member'));
  assert.equal(await db.getReminderById(gymA.id, logB[0].id), undefined);
  assert.ok(mine);
});

test('a STOP reply switches reminders off for that gym only', async () => {
  const a = await db.addMember(gymA.id, member('Shared Number', '+14155550301', 3));
  const b = await db.addMember(gymB.id, member('Shared Number', '+14155550301', 3));
  assert.equal(await db.stopRemindersForPhone(gymA.id, '+14155550301'), 1);
  assert.equal(await db.stopRemindersForPhone(gymA.id, '+14155550301'), 0);
  assert.equal((await db.getMemberById(gymA.id, a.id)).reminders_off, 1);
  assert.equal((await db.getMemberById(gymB.id, b.id)).reminders_off, 0);
  assert.equal(wa._phoneFromJid('919876543210:12@s.whatsapp.net'), '+919876543210');
  assert.equal(wa._phoneFromJid('12345@lid'), '');
  assert.equal(wa._phoneFromJid('120363@g.us'), '');
});

test('suspended and unlinked gyms send nothing', async () => {
  const gymC = await makeGym('Charlie');
  await db.addMember(gymC.id, member('Charlie Member', '+14155550401', 1));
  assert.deepEqual(await rem.runReminders(gymC.id, { manual: true }), { skipped: 'WhatsApp is not connected' });
  await linked(gymC);
  await db.setGymStatus(gymC.id, 'suspended');
  assert.deepEqual(await rem.runReminders(gymC.id, { manual: true }), { skipped: 'This account is not active' });
});

test('the overseer list has counts but no member details', async () => {
  const list = await db.listGymsForAdmin(rem.addDays(today, -30));
  const alpha = list.find((g) => g.name === 'Alpha');
  assert.ok(alpha.member_count >= 6);
  assert.ok(alpha.sent_recent >= 3);
  assert.doesNotMatch(JSON.stringify(list), /\+1415|In Window|Bravo Member|password/);
});
