// Gym accounts: passwords, login sessions, and the checks every request goes through.

const crypto = require('crypto');
const { promisify } = require('util');
const db = require('./db');

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 30;
const COOKIE = 'gp_session';

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function readCookie(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=');
  }
  return '';
}

function setCookie(req, res, token, maxAgeSeconds) {
  const secure = req.secure ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
  );
}

async function startSession(req, res, gym) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await db.createSession(hashToken(token), gym.id, expires);
  setCookie(req, res, token, SESSION_DAYS * 86400);
}

async function endSession(req, res) {
  const token = readCookie(req);
  if (token) await db.deleteSession(hashToken(token));
  setCookie(req, res, '', 0);
}

// What the browser is allowed to know about the logged-in gym.
function publicGym(gym) {
  return {
    id: gym.id,
    name: gym.name,
    email: gym.email,
    is_admin: !!gym.is_admin,
    status: gym.status,
    payment_url: gym.payment_url,
    message_template: gym.message_template || db.DEFAULT_TEMPLATE,
    default_template: db.DEFAULT_TEMPLATE,
    send_hour: gym.send_hour,
    renewal_months: gym.renewal_months,
    theme_color: gym.theme_color,
    theme_mode: gym.theme_mode,
    logo: gym.logo
  };
}

// ---- Request checks ----

// Changes must come from the GymPing page itself, not from another website open in the browser.
function sameSite(req, res, next) {
  if (req.method !== 'GET' && req.get('x-gymping') === undefined) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  next();
}

async function loggedIn(req, res, next) {
  try {
    const token = readCookie(req);
    const gym = token ? await db.getSessionGym(hashToken(token)) : null;
    if (!gym) return res.status(401).json({ error: 'Please log in' });
    req.gym = gym;
    next();
  } catch (err) {
    next(err);
  }
}

// A gym that has been approved and not suspended.
function activeGym(req, res, next) {
  if (req.gym.is_admin) return res.status(403).json({ error: 'The overseer account has no gym' });
  if (req.gym.status !== 'active') {
    return res.status(403).json({ error: 'This account is not active', status: req.gym.status });
  }
  next();
}

function admin(req, res, next) {
  if (!req.gym.is_admin) return res.status(403).json({ error: 'Not allowed' });
  next();
}

// ---- Slowing down password guessing ----

const failures = new Map(); // key -> { count, until }
const MAX_FAILURES = 8;
const LOCK_MS = 15 * 60 * 1000;

function isLocked(key) {
  const f = failures.get(key);
  return !!f && f.count >= MAX_FAILURES && f.until > Date.now();
}

function recordFailure(key) {
  const f = failures.get(key);
  const fresh = !f || f.until < Date.now();
  failures.set(key, { count: fresh ? 1 : f.count + 1, until: Date.now() + LOCK_MS });
}

function clearFailures(key) {
  failures.delete(key);
}

module.exports = {
  hashPassword,
  verifyPassword,
  startSession,
  endSession,
  publicGym,
  sameSite,
  loggedIn,
  activeGym,
  admin,
  isLocked,
  recordFailure,
  clearFailures
};
