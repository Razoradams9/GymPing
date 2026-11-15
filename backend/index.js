const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const db = require('./db');
const { getStatus, sendMessage } = require('./whatsapp');

const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// GET /api/status
app.get('/api/status', (req, res) => {
  res.json(getStatus());
});

// GET /api/members
app.get('/api/members', (req, res) => {
  const members = db.getAllMembers();
  const today = new Date(new Date().toISOString().split('T')[0]);
  const withDays = members.map((m) => ({
    ...m,
    days_remaining: Math.ceil(
      (new Date(m.membership_end_date) - today) / (1000 * 60 * 60 * 24)
    )
  }));
  res.json(withDays);
});

// POST /api/members
app.post('/api/members', (req, res) => {
  const { name, phone, membership_end_date } = req.body;
  if (!name || !phone || !membership_end_date) {
    return res.status(400).json({ error: 'name, phone, and membership_end_date are required' });
  }
  const member = db.addMember(name, phone, membership_end_date);
  res.status(201).json(member);
});

// PUT /api/members/:id
app.put('/api/members/:id', (req, res) => {
  const { name, phone, membership_end_date } = req.body;
  const member = db.updateMember(req.params.id, name, phone, membership_end_date);
  res.json(member);
});

// DELETE /api/members/:id
app.delete('/api/members/:id', (req, res) => {
  db.deleteMember(req.params.id);
  res.json({ success: true });
});

// GET /api/settings
app.get('/api/settings', (req, res) => {
  res.json(db.getSettings());
});

// POST /api/settings
app.post('/api/settings', (req, res) => {
  const { gym_name, payment_url } = req.body;
  const settings = db.saveSettings(gym_name, payment_url);
  res.json(settings);
});

// GET /api/reminders
app.get('/api/reminders', (req, res) => {
  res.json(db.getRecentReminders(50));
});

// Daily cron job at 9:00 AM
cron.schedule('0 9 * * *', async () => {
  console.log('Running daily reminder check...');

  const targetDateObj = new Date();
  targetDateObj.setDate(targetDateObj.getDate() + 4);
  const targetDate = targetDateObj.toISOString().split('T')[0];

  const members = db.getMembersExpiringOn(targetDate);
  const settings = db.getSettings();
  const gymName = settings.gym_name || 'My Gym';
  const paymentUrl = settings.payment_url || '';

  for (const member of members) {
    try {
      if (!db.hasReminderBeenSent(member.id, member.membership_end_date)) {
        const message =
          `Hey ${member.name}! 👋 Your membership at ${gymName} expires in 4 days (${member.membership_end_date}). Renew now to keep going: ${paymentUrl}`;
        await sendMessage(member.phone, message);
        db.logReminder(member.id, member.membership_end_date);
        console.log(`Reminder sent to ${member.name} (${member.phone})`);
      }
    } catch (err) {
      console.error(`Failed to send reminder to ${member.name}:`, err.message);
    }
  }

  console.log(`Daily reminder check complete. Processed ${members.length} member(s).`);
});

app.listen(3001, () => console.log('GymPing backend running on port 3001'));
