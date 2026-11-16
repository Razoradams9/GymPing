// WhatsApp links, one per gym. A gym owner scans a QR code once; the link's
// sign-in keys are kept in the database so it survives restarts. If WhatsApp
// ends the link, a fresh QR code is produced the next time the owner looks.
//
// This talks to WhatsApp directly (Baileys), with no hidden browser, so many
// gyms fit in one small server.
//
// GYMPING_FAKE_WA=1 swaps in a stand-in that sends nothing, for trying the app
// without a phone. Numbers ending in 0000 fail, to exercise the failure path.

const qrcode = require('qrcode');
const pino = require('pino');
const db = require('./db');

const fake = process.env.GYMPING_FAKE_WA === '1';
const IDLE_MS = 3 * 60 * 1000; // stop producing QR codes nobody is looking at

let B = null; // the baileys module (ESM, loaded on first use)
const links = new Map(); // gym id -> Link
const readyListeners = [];
const stopListeners = [];

function onReady(fn) {
  readyListeners.push(fn);
}

// fn(gymId, phone) is called when someone replies STOP to a gym's number.
function onStopRequest(fn) {
  stopListeners.push(fn);
}

const quietly = (label, fn) =>
  Promise.resolve()
    .then(fn)
    .catch((err) => console.error(`${label}:`, (err && err.message) || err));

async function authState(gymId) {
  const { initAuthCreds, BufferJSON, proto } = B;
  const read = async (key) => {
    const value = await db.getWaAuth(gymId, key);
    return value ? JSON.parse(value, BufferJSON.reviver) : null;
  };
  const write = (key, value) => db.setWaAuth(gymId, key, JSON.stringify(value, BufferJSON.replacer));

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
            else await db.deleteWaAuth(gymId, `${category}-${id}`);
          }
        }
      }
    },
    saveCreds: () => write('creds', creds)
  };
}

// '14155550101@s.whatsapp.net' or '14155550101:3@s.whatsapp.net' -> '+14155550101'; anything else -> ''.
function phoneFromJid(jid) {
  const s = String(jid || '');
  if (!s.endsWith('@s.whatsapp.net')) return '';
  const digits = s.split('@')[0].split(':')[0].replace(/\D/g, '');
  return digits.length >= 8 ? `+${digits}` : '';
}

class Link {
  constructor(gymId) {
    this.gymId = gymId;
    this.state = 'starting'; // starting | qr | connected | disconnected
    this.qr = null;
    this.sock = null;
    this.stopped = false;
    this.retryMs = 3000;
    this.lastLooked = Date.now();
    this.linked = fake; // has this gym paired its number?
    this.pairingCode = null; // code to type into WhatsApp, when linking by phone number
  }

  status() {
    return {
      state: this.state,
      connected: this.state === 'connected',
      qr: this.qr,
      pairing_code: this.pairingCode
    };
  }

  setConnected() {
    this.state = 'connected';
    this.linked = true;
    this.qr = null;
    this.pairingCode = null;
    this.retryMs = 3000;
    console.log(`Gym ${this.gymId}: WhatsApp is connected.`);
    for (const fn of readyListeners) quietly('WhatsApp ready handler failed', () => fn(this.gymId));
  }

  start() {
    if (fake) {
      // GYMPING_FAKE_QR_MS shows a pretend QR code for that long first, to try the connect screen.
      const qrMs = Number(process.env.GYMPING_FAKE_QR_MS) || 0;
      if (qrMs) {
        qrcode.toDataURL('GymPing demo').then((url) => {
          if (this.stopped || this.state === 'connected') return;
          this.qr = url;
          this.state = 'qr';
        });
      }
      setTimeout(() => !this.stopped && this.setConnected(), qrMs + 100);
      return;
    }
    this.connect().catch((err) => this.retryLater(err));
  }

  retryLater(err) {
    console.error(`Gym ${this.gymId}: WhatsApp failed to start, retrying:`, (err && err.message) || err);
    this.state = 'disconnected';
    this.retryMs = Math.min(this.retryMs * 2, 60000);
    if (!this.stopped) setTimeout(() => this.connect().catch((e) => this.retryLater(e)), this.retryMs);
  }

  async connect() {
    if (this.stopped) return;
    B = B || (await import('baileys'));
    const { default: makeWASocket, DisconnectReason, makeCacheableSignalKeyStore, Browsers, fetchLatestBaileysVersion } = B;
    const logger = pino({ level: 'silent' });
    const auth = await authState(this.gymId);
    this.linked = !!auth.creds.account;
    const { version } = await fetchLatestBaileysVersion();
    if (this.stopped) return;

    const s = makeWASocket({
      version,
      logger,
      auth: { creds: auth.creds, keys: makeCacheableSignalKeyStore(auth.keys, logger) },
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      markOnlineOnConnect: false
    });
    this.sock = s;
    const on = (event, fn) => s.ev.on(event, (arg) => quietly('WhatsApp handler failed', () => fn(arg)));

    on('creds.update', auth.saveCreds);
    on('contacts.upsert', (contacts) => this.saveContacts(contacts));
    on('messaging-history.set', (history) => this.saveContacts(history.contacts));
    on('messages.upsert', (upsert) => this.watchForStop(upsert));

    on('connection.update', async (update) => {
      if (this.sock !== s) return;
      if (update.qr) {
        this.qr = await qrcode.toDataURL(update.qr);
        this.state = 'qr';
      }
      if (update.connection === 'open') this.setConnected();
      if (update.connection === 'close') {
        this.sock = null;
        this.state = 'disconnected';
        this.qr = null;
        if (this.stopped) return;
        const code = update.lastDisconnect?.error?.output?.statusCode;
        let wait = this.retryMs;
        const abandonedCode = this.pairingCode && code !== DisconnectReason.restartRequired;
        this.pairingCode = null;
        if (abandonedCode) {
          // A phone-number code was requested but never entered: forget the half-finished link.
          await db.clearWaAuth(this.gymId);
          wait = 1000;
        } else if (code === DisconnectReason.loggedOut || code === DisconnectReason.badSession) {
          // The link is gone (unlinked from the phone, or broken): start over with a fresh QR code.
          console.log(`Gym ${this.gymId}: WhatsApp link ended; a new QR code is needed.`);
          await db.clearWaAuth(this.gymId);
          wait = 1000;
        } else if (code === DisconnectReason.restartRequired) {
          wait = 0; // normal right after scanning the QR code
        } else if (code === DisconnectReason.connectionReplaced) {
          console.log(`Gym ${this.gymId}: WhatsApp link is in use elsewhere; retrying in a minute.`);
          wait = 60000;
        } else {
          console.log(`Gym ${this.gymId}: WhatsApp disconnected (${code || 'no code'}); reconnecting.`);
          this.retryMs = Math.min(this.retryMs * 2, 60000);
        }
        setTimeout(() => this.connect().catch((e) => this.retryLater(e)), wait);
      }
    });
  }

  // Linking without a camera: WhatsApp accepts an 8-character code typed on the phone instead of a QR scan.
  async requestPairingCode(phone) {
    if (this.state === 'connected') throw new Error('WhatsApp is already connected');
    if (fake) {
      this.pairingCode = 'GYMP1NG8';
      return this.pairingCode;
    }
    // The connection must be up and waiting to be linked, which is when it has a QR code ready.
    for (let i = 0; i < 30 && this.state !== 'qr'; i++) await new Promise((r) => setTimeout(r, 500));
    if (this.state !== 'qr' || !this.sock) throw new Error('WhatsApp is still starting. Try again in a moment.');
    this.pairingCode = await this.sock.requestPairingCode(String(phone).replace(/\D/g, ''));
    return this.pairingCode;
  }

  // Remember the owner's phone contacts as WhatsApp shares them after linking.
  async saveContacts(contacts) {
    for (const c of contacts || []) {
      const phone = phoneFromJid(c.phoneNumber) || phoneFromJid(c.id);
      const name = c.name || c.notify;
      if (phone && name) await db.saveWaContact(this.gymId, phone, name);
    }
  }

  // Only looks for a one-word STOP in direct chats. Nothing else about incoming messages is read or kept.
  async watchForStop({ messages, type }) {
    if (type !== 'notify') return;
    for (const m of messages || []) {
      if (!m.message || m.key.fromMe) continue;
      const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
      if (!/^\s*stop\s*[.!]?\s*$/i.test(text)) continue;
      const phone = phoneFromJid(m.key.remoteJid) || phoneFromJid(m.key.remoteJidAlt);
      if (!phone) continue;
      for (const fn of stopListeners) await fn(this.gymId, phone);
    }
  }

  async send(phone, message) {
    const digits = String(phone).replace(/\D/g, '');
    if (this.state !== 'connected') throw new Error('WhatsApp is not connected');
    if (fake) {
      if (digits.endsWith('0000')) throw new Error('This number is not on WhatsApp');
      console.log(`[fake WhatsApp, gym ${this.gymId}] to +${digits}: ${message}`);
      return;
    }
    const [found] = (await this.sock.onWhatsApp(digits)) || [];
    if (!found || !found.exists) throw new Error('This number is not on WhatsApp');
    await this.sock.sendMessage(found.jid, { text: message });
  }

  async stop() {
    this.stopped = true;
    this.state = 'disconnected';
    this.qr = null;
    const s = this.sock;
    this.sock = null;
    if (s) await quietly('WhatsApp stop failed', () => s.end(undefined));
  }
}

// The gym's link, started if it isn't running. Called whenever the owner looks at the app.
function linkFor(gymId) {
  let link = links.get(gymId);
  if (!link) {
    link = new Link(gymId);
    links.set(gymId, link);
    link.start();
  }
  link.lastLooked = Date.now();
  return link;
}

function getStatus(gymId) {
  return linkFor(gymId).status();
}

function requestPairingCode(gymId, phone) {
  return linkFor(gymId).requestPairingCode(phone);
}

function isConnected(gymId) {
  const link = links.get(gymId);
  return !!link && link.state === 'connected';
}

function sendMessage(gymId, phone, message) {
  const link = links.get(gymId);
  if (!link) throw new Error('WhatsApp is not connected');
  return link.send(phone, message);
}

// The owner's saved phone contacts, for adding members without retyping.
async function getContacts(gymId) {
  if (!isConnected(gymId)) throw new Error('WhatsApp is not connected');
  if (fake) {
    return [
      { name: 'Alex Demo', phone: '+14155550101' },
      { name: 'Sarah Demo', phone: '+14155550102' },
      { name: 'Wrong Number Demo', phone: '+14155550000' }
    ];
  }
  return db.getWaContacts(gymId);
}

// Unlink a gym's WhatsApp number; a new QR code appears for linking another.
async function logout(gymId) {
  const link = links.get(gymId);
  links.delete(gymId);
  if (link) {
    const s = link.sock;
    link.stopped = true;
    if (s) await quietly('WhatsApp logout failed', () => s.logout());
    await link.stop();
  }
  await db.clearWaAuth(gymId);
  await db.clearWaContacts(gymId);
}

// Disconnect without unlinking (e.g. the account was suspended).
async function stopLink(gymId) {
  const link = links.get(gymId);
  links.delete(gymId);
  if (link) await link.stop();
}

// At startup: reconnect every active gym that has already linked a number.
async function startLinked() {
  if (!fake) B = B || (await import('baileys'));
  for (const gym of await db.getActiveGyms()) {
    let linked = fake;
    if (!fake) {
      const raw = await db.getWaAuth(gym.id, 'creds');
      linked = !!raw && !!JSON.parse(raw, B.BufferJSON.reviver).account;
    }
    if (linked) linkFor(gym.id);
  }
}

async function stopAll() {
  const all = [...links.values()];
  links.clear();
  await Promise.all(all.map((link) => link.stop()));
}

// An unlinked gym only needs QR codes while its owner has the app open.
setInterval(() => {
  for (const [gymId, link] of links) {
    if (!link.linked && link.state !== 'connected' && Date.now() - link.lastLooked > IDLE_MS) {
      links.delete(gymId);
      link.stop();
    }
  }
}, 60 * 1000).unref();

module.exports = {
  onReady,
  onStopRequest,
  getStatus,
  requestPairingCode,
  isConnected,
  sendMessage,
  getContacts,
  logout,
  stopLink,
  startLinked,
  stopAll,
  _phoneFromJid: phoneFromJid
};
