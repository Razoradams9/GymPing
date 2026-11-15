// WhatsApp link. The owner scans a QR code once (like WhatsApp Web) and the
// session is kept on disk. If WhatsApp logs the session out, a fresh QR code is
// produced automatically.
//
// GYMPING_FAKE_WA=1 swaps in a stand-in that sends nothing, for trying the app
// without a phone. Numbers ending in 0000 fail, to exercise the failure path.

const fake = process.env.GYMPING_FAKE_WA === '1';

let state = 'starting'; // starting | qr | connected | disconnected
let currentQR = null;
let client = null;
const readyListeners = [];

function onReady(fn) {
  readyListeners.push(fn);
}

function setConnected() {
  state = 'connected';
  currentQR = null;
  console.log('WhatsApp is connected.');
  for (const fn of readyListeners) {
    Promise.resolve()
      .then(fn)
      .catch((err) => console.error('WhatsApp ready handler failed:', err));
  }
}

function getStatus() {
  return { state, connected: state === 'connected', qr: currentQR };
}

function isConnected() {
  return state === 'connected';
}

function restart(delayMs) {
  const old = client;
  client = null;
  Promise.resolve(old && old.destroy())
    .catch(() => {})
    .then(() => setTimeout(start, delayMs));
}

function start() {
  if (fake) {
    setTimeout(setConnected, 100);
    return;
  }

  const { Client, LocalAuth } = require('whatsapp-web.js');
  const qrcode = require('qrcode');

  const c = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
  });
  client = c;

  c.on('qr', async (qr) => {
    try {
      currentQR = await qrcode.toDataURL(qr);
      state = 'qr';
      console.log('QR code ready. Open the Settings page to scan it.');
    } catch (err) {
      console.error('Failed to generate QR code:', err);
    }
  });

  c.on('ready', setConnected);

  c.on('auth_failure', (msg) => {
    console.error('WhatsApp sign-in failed:', msg);
    state = 'disconnected';
    if (client === c) restart(5000);
  });

  c.on('disconnected', (reason) => {
    console.log('WhatsApp disconnected:', reason);
    state = 'disconnected';
    currentQR = null;
    if (client === c) restart(5000);
  });

  c.initialize().catch((err) => {
    console.error('WhatsApp failed to start, retrying in 30s:', err.message);
    state = 'disconnected';
    if (client === c) restart(30000);
  });
}

async function sendMessage(phone, message) {
  const digits = String(phone).replace(/\D/g, '');
  if (!isConnected()) throw new Error('WhatsApp is not connected');
  if (fake) {
    if (digits.endsWith('0000')) throw new Error('This number is not on WhatsApp');
    console.log(`[fake WhatsApp] to +${digits}: ${message}`);
    return;
  }
  const id = await client.getNumberId(digits);
  if (!id) throw new Error('This number is not on WhatsApp');
  await client.sendMessage(id._serialized, message);
}

// The owner's saved phone contacts, for adding members without retyping.
async function getContacts() {
  if (!isConnected()) throw new Error('WhatsApp is not connected');
  if (fake) {
    return [
      { name: 'Alex Demo', phone: '+14155550101' },
      { name: 'Sarah Demo', phone: '+14155550102' },
      { name: 'Wrong Number Demo', phone: '+14155550000' }
    ];
  }
  const contacts = await client.getContacts();
  const seen = new Set();
  const out = [];
  for (const c of contacts) {
    if (!c.isMyContact || c.isGroup || c.isMe || !c.id || c.id.server !== 'c.us') continue;
    const number = String(c.number || c.id.user || '').replace(/\D/g, '');
    if (!number || seen.has(number)) continue;
    seen.add(number);
    out.push({ name: c.name || c.pushname || `+${number}`, phone: `+${number}` });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Unlink this WhatsApp account; a new QR code appears for linking another.
async function logout() {
  if (fake) return;
  if (!client) return;
  const c = client;
  state = 'disconnected';
  currentQR = null;
  await c.logout().catch((err) => console.error('WhatsApp logout failed:', err.message));
  if (client === c) restart(2000);
}

module.exports = { start, onReady, getStatus, isConnected, sendMessage, getContacts, logout };
