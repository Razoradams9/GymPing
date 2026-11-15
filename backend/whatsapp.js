// WhatsApp link. The owner scans a QR code once (like WhatsApp Web) and the
// session is kept. If WhatsApp logs the session out, a fresh QR code is
// produced automatically.
//
// Two ways of connecting:
//   browser (default)  drives WhatsApp Web in a hidden browser; needs about 1 GB of memory
//   light              talks to WhatsApp directly; for small servers. GYMPING_WA_ENGINE=light
//
// GYMPING_FAKE_WA=1 swaps in a stand-in that sends nothing, for trying the app
// without a phone. Numbers ending in 0000 fail, to exercise the failure path.

const fs = require('fs');
const path = require('path');

const os = require('os');
const db = require('./db');

const fake = process.env.GYMPING_FAKE_WA === '1';
const light = !fake && process.env.GYMPING_WA_ENGINE === 'light' ? require('./wa-light') : null;

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
    // GYMPING_FAKE_QR_MS shows a pretend QR code for that long first, to try the connect screen.
    const qrMs = Number(process.env.GYMPING_FAKE_QR_MS) || 0;
    if (qrMs) {
      require('qrcode')
        .toDataURL('GymPing demo')
        .then((url) => {
          currentQR = url;
          state = 'qr';
        });
    }
    setTimeout(setConnected, qrMs + 100);
    return;
  }

  if (light) {
    const hooks = {
      setQR: (url) => {
        currentQR = url;
        state = 'qr';
      },
      setConnected,
      setDisconnected: () => {
        state = 'disconnected';
        currentQR = null;
      }
    };
    light.start(hooks).catch((err) => {
      console.error('WhatsApp failed to start, retrying in 30s:', (err && err.message) || err);
      state = 'disconnected';
      setTimeout(start, 30000);
    });
    return;
  }

  const { Client, LocalAuth, RemoteAuth } = require('whatsapp-web.js');
  const qrcode = require('qrcode');

  let authStrategy;
  if (db.usePostgres) {
    // No lasting disk: keep the WhatsApp link in the database and restore it on every start.
    const dataPath = path.join(os.tmpdir(), 'gymping_wa');
    fs.mkdirSync(dataPath, { recursive: true });
    const zip = (session) => path.join(dataPath, `${session}.zip`);
    authStrategy = new RemoteAuth({
      dataPath,
      backupSyncIntervalMs: 30 * 60 * 1000,
      store: {
        sessionExists: ({ session }) => db.hasSession(session),
        save: async ({ session }) => db.saveSession(session, await fs.promises.readFile(zip(session))),
        extract: async ({ session, path: out }) => fs.promises.writeFile(out, await db.loadSession(session)),
        delete: ({ session }) => db.deleteSession(session)
      }
    });
  } else {
    // Keep the WhatsApp session on the persistent disk when hosted.
    const dataPath = process.env.GYMPING_DATA_DIR
      ? path.join(process.env.GYMPING_DATA_DIR, 'wwebjs_auth')
      : undefined;
    // After an abrupt restart the browser profile can still look "in use"; clear the stale locks.
    for (const lock of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
      fs.rmSync(path.join(dataPath || '.wwebjs_auth', 'session', lock), { force: true });
    }
    authStrategy = new LocalAuth({ dataPath });
  }

  const c = new Client({
    authStrategy,
    // WhatsApp Web can take well over the library's 30s default to load on a slow PC or connection.
    authTimeoutMs: 120000,
    puppeteer: {
      // GYMPING_SHOW_BROWSER=1 opens the WhatsApp Web window, to see what it is stuck on.
      headless: process.env.GYMPING_SHOW_BROWSER !== '1',
      // On a server, use the system browser named by PUPPETEER_EXECUTABLE_PATH.
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        // Keep memory low for small servers.
        '--no-zygote',
        '--disable-extensions',
        '--mute-audio',
        '--no-first-run'
      ]
    }
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
  c.on('remote_session_saved', () => console.log('WhatsApp link saved to the database.'));

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
    // The library throws plain strings for some failures, so don't rely on err.message.
    console.error('WhatsApp failed to start, retrying in 30s:', (err && err.message) || err);
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
  if (light) return light.sendMessage(digits, message);
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
  if (light) return light.getContacts();
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
  if (light) {
    state = 'disconnected';
    currentQR = null;
    return light.logout();
  }
  if (!client) return;
  const c = client;
  state = 'disconnected';
  currentQR = null;
  await c.logout().catch((err) => console.error('WhatsApp logout failed:', err.message));
  if (client === c) restart(2000);
}

// Closes the hidden browser so nothing is left running after GymPing stops.
async function stop() {
  const c = client;
  client = null;
  state = 'disconnected';
  if (light) await light.stop().catch(() => {});
  if (c) await c.destroy().catch(() => {});
}

module.exports = { start, stop, onReady, getStatus, isConnected, sendMessage, getContacts, logout };
