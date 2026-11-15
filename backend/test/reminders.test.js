const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.GYMPING_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gymping-')), 'test.db');
process.env.GYMPING_FAKE_WA = '1';
process.env.GYMPING_SEND_GAP_MS = '0';

const db = require('../db');
const wa = require('../whatsapp');
const rem = require('../reminders');

const today = rem.localDate();

test.before(async () => {
  wa.start();
  await new Promise((resolve) => wa.onReady(resolve));
});

test('date helpers', () => {
  assert.equal(rem.addDays('2026-12-30', 4), '2027-01-03');
  assert.equal(rem.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(rem.addMonths('2026-11-19', 2), '2027-01-19');
  assert.equal(rem.daysBetween('2026-11-15', '2026-11-19'), 4);
  assert.equal(rem.isValidDate('2026-02-30'), false);
  assert.equal(rem.isValidDate('2026-02-28'), true);
});

test('phone numbers', () => {
  assert.equal(rem.normalizePhone('+1 (415) 555-2671', ''), '+14155552671');
  assert.equal(rem.normalizePhone('0300 1234567', '92'), '+923001234567');
  assert.equal(rem.normalizePhone('0044 7911 123456', '92'), '+447911123456');
  assert.equal(rem.normalizePhone('12345', ''), null);
});

test('message wording', () => {
  const settings = { gym_name: 'FitZone', payment_url: 'https://pay.example/renew' };
  const member = { name: 'Sarah Khan', membership_end_date: '2026-11-19' };
  assert.equal(
    rem.buildMessage(db.DEFAULT_TEMPLATE, member, settings, '2026-11-15'),
    'Hey Sarah! 👋 Your membership at FitZone expires in 4 days (Nov 19). Renew now to keep your streak going: https://pay.example/renew'
  );
  assert.match(rem.buildMessage('{when}', member, settings, '2026-11-18'), /^tomorrow$/);
  assert.match(rem.buildMessage('{when} {oops}', member, settings, '2026-11-19'), /^today \{oops\}$/);
});

test('one reminder per member per day, only inside the 4-day window', async () => {
  const inWindow = db.addMember('In Window', '+14155550101', rem.addDays(today, 4));
  const lastDay = db.addMember('Last Day', '+14155550102', today);
  const tooEarly = db.addMember('Too Early', '+14155550103', rem.addDays(today, 5));
  const expired = db.addMember('Expired', '+14155550104', rem.addDays(today, -1));

  assert.deepEqual(await rem.runReminders({ manual: true }), { sent: 2, failed: 0 });
  assert.equal(db.getReminder(inWindow.id, today).status, 'sent');
  assert.equal(db.getReminder(lastDay.id, today).status, 'sent');
  assert.equal(db.getReminder(tooEarly.id, today), undefined);
  assert.equal(db.getReminder(expired.id, today), undefined);

  // Running again the same day sends nothing more.
  assert.deepEqual(await rem.runReminders({ manual: true }), { sent: 0, failed: 0 });
});

test('failed sends are logged, retried, and fixed by correcting the number', async () => {
  const bad = db.addMember('Bad Number', '+14155550000', rem.addDays(today, 2));
  assert.deepEqual(await rem.runReminders({ manual: true }), { sent: 0, failed: 1 });
  let r = db.getReminder(bad.id, today);
  assert.equal(r.status, 'failed');
  assert.match(r.error, /not on WhatsApp/);

  db.updateMember(bad.id, bad.name, '+14155550105', bad.membership_end_date);
  assert.deepEqual(await rem.runReminders({ manual: true }), { sent: 1, failed: 0 });
  r = db.getReminder(bad.id, today);
  assert.equal(r.status, 'sent');
  assert.equal(r.attempts, 2);
  assert.equal(r.error, null);
});
