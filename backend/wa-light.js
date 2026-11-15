// Lightweight WhatsApp link: talks to WhatsApp directly (Baileys), with no hidden
// browser, so it fits on small servers. Its sign-in keys and the contact list
// are kept in the database, so the link survives restarts.

const qrcode = require('qrcode');
const pino = require('pino');
const db = require('./db');

let B = null; // the baileys module (ESM, loaded on first start)
let sock = null;
let hooks = null;
let stopped = false;
let retryMs = 3000;

async function authState() {
  const { initAuthCreds, BufferJSON, proto } = B;
  const read = async (key) => {
    const value = await db.getWaAuth(key);
    return value ? JSON.parse(value, BufferJSON.reviver) : null;
  };
  const write = (key, value) => db.setWaAuth(key, JSON.stringify(value, BufferJSON.replacer));

  const creds = (await read('creds')) || initAuthCreds();
  return {
    creds,
    keys: {
      get: async (type, ids) => {
        const data = {};
        for (const id of ids) {
          let value = await read(`${type}-${id}`);
          if (type === 'app-state-sync-key' && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }
          data[id] = value;
        }
        return data;
      },
      set: async (data) => {
        for (const category of Object.keys(data)) {
          for (const id of Object.keys(data[category])) {
            const value = data[category][id];
            if (value) await write(`${category}-${id}`, value);
            else await db.deleteWaAuth(`${category}-${id}`);
          }
        }
      }
    },
    saveCreds: () => write('creds', creds)
  };
}

// Remember the owner's phone contacts as WhatsApp shares them after linking.
async function saveContacts(contacts) {
  for (const c of contacts || []) {
    const source = c.phoneNumber || (String(c.id || '').endsWith('@s.whatsapp.net') ? c.id : '');
    const digits = String(source).split('@')[0].split(':')[0].replace(/\D/g, '');
    const name = c.name || c.notify;
    if (digits.length >= 8 && name) await db.saveWaContact(`+${digits}`, name);
  }
}

async function connect() {
  if (stopped) return;
  const { default: makeWASocket, DisconnectReason, makeCacheableSignalKeyStore, Browsers, fetchLatestBaileysVersion } = B;
  const logger = pino({ level: 'silent' });
  const auth = await authState();
  const { version } = await fetchLatestBaileysVersion();

  const s = makeWASocket({
    version,
    logger,
    auth: { creds: auth.creds, keys: makeCacheableSignalKeyStore(auth.keys, logger) },
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    markOnlineOnConnect: false
  });
  sock = s;

  const safely = (fn) => (arg) =>
    Promise.resolve()
      .then(() => fn(arg))
      .catch((err) => console.error('WhatsApp handler failed:', err.message));

  s.ev.on('creds.update', safely(auth.saveCreds));
  s.ev.on('contacts.upsert', safely(saveContacts));
  s.ev.on('messaging-history.set', safely((history) => saveContacts(history.contacts)));

  s.ev.on(
    'connection.update',
    safely(async (update) => {
      if (sock !== s) return;
      if (update.qr) {
        hooks.setQR(await qrcode.toDataURL(update.qr));
        console.log('QR code ready. Open GymPing to scan it.');
      }
      if (update.connection === 'open') {
        retryMs = 3000;
        hooks.setConnected();
      }
      if (update.connection === 'close') {
        sock = null;
        hooks.setDisconnected();
        if (stopped) return;
        const code = update.lastDisconnect?.error?.output?.statusCode;
        let wait = retryMs;
        if (code === DisconnectReason.loggedOut || code === DisconnectReason.badSession) {
          // The link is gone (unlinked from the phone, or broken): start over with a fresh QR code.
          console.log('WhatsApp link ended; a new QR code is needed.');
          await db.clearWaAuth();
          wait = 1000;
        } else if (code === DisconnectReason.restartRequired) {
          wait = 0; // normal right after scanning the QR code
        } else if (code === DisconnectReason.connectionReplaced) {
          console.log('WhatsApp link is in use by another copy of GymPing; retrying in a minute.');
          wait = 60000;
        } else {
          console.log(`WhatsApp disconnected (${code || 'no code'}); reconnecting.`);
          retryMs = Math.min(retryMs * 2, 60000);
        }
        setTimeout(() => connect().catch(retryLater), wait);
      }
    })
  );
}

function retryLater(err) {
  console.error('WhatsApp failed to start, retrying:', (err && err.message) || err);
  hooks.setDisconnected();
  retryMs = Math.min(retryMs * 2, 60000);
  if (!stopped) setTimeout(() => connect().catch(retryLater), retryMs);
}

async function start(callbacks) {
  hooks = callbacks;
  stopped = false;
  B = B || (await import('baileys'));
  await connect();
}

async function sendMessage(digits, message) {
  if (!sock) throw new Error('WhatsApp is not connected');
  const [found] = (await sock.onWhatsApp(digits)) || [];
  if (!found || !found.exists) throw new Error('This number is not on WhatsApp');
  await sock.sendMessage(found.jid, { text: message });
}

function getContacts() {
  return db.getWaContacts();
}

// Unlink this WhatsApp account; the close handler then asks for a new QR code.
async function logout() {
  if (sock) await sock.logout();
  else await db.clearWaAuth();
  await db.clearWaContacts();
}

async function stop() {
  stopped = true;
  const s = sock;
  sock = null;
  if (s) await s.end(undefined);
}

module.exports = { start, sendMessage, getContacts, logout, stop, _saveContacts: saveContacts, _authState: authState };
