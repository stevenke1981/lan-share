const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const sessions = new Map();
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Password hashing (scrypt) ──────────────────────────
const HASH_PREFIX = 'scrypt$';

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 32).toString('hex');
  return `${HASH_PREFIX}${salt}$${hash}`;
}

function verifyPassword(plain, stored) {
  if (!stored.startsWith(HASH_PREFIX)) {
    // Plaintext compatibility mode
    return plain === stored;
  }
  const parts = stored.slice(HASH_PREFIX.length).split('$');
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const computed = crypto.scryptSync(plain, salt, 32).toString('hex');
  const a = Buffer.from(computed);
  const b = Buffer.from(hash);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ─── Rate limiting ──────────────────────────────────────
const loginFails = new Map();
const MAX_LOGIN_FAILS = parseInt(process.env.MAX_LOGIN_FAILS || '5', 10);
const LOGIN_LOCK_MS = parseInt(process.env.LOGIN_LOCK_MS || '900000', 10);

function getClientIp(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(ip) {
  const entry = loginFails.get(ip);
  if (!entry) return true;
  if (entry.fails >= MAX_LOGIN_FAILS) {
    if (Date.now() < entry.lockedUntil) {
      return false;
    }
    loginFails.delete(ip);
    return true;
  }
  return true;
}

function recordLoginFail(ip) {
  const now = Date.now();
  let entry = loginFails.get(ip);
  if (!entry) {
    entry = { fails: 0, lockedUntil: 0 };
    loginFails.set(ip, entry);
  }
  entry.fails++;
  if (entry.fails >= MAX_LOGIN_FAILS) {
    entry.lockedUntil = now + LOGIN_LOCK_MS;
  }
}

function recordLoginSuccess(ip) {
  loginFails.delete(ip);
}

// ─── Credential loading ─────────────────────────────────
function loadCredentials(authFile) {
  if (!fs.existsSync(authFile)) {
    console.warn(`Auth file not found: ${authFile}`);
    return null;
  }
  try {
    const data = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
    if (!data.username || !data.password) {
      console.warn('Auth file must contain username and password');
      return null;
    }
    // Warn if plaintext password
    if (data.password && !data.password.startsWith(HASH_PREFIX)) {
      console.warn('⚠️  Auth file contains plaintext password. Use hashPassword() to generate a hashed password for better security.');
    }
    return data;
  } catch (err) {
    console.warn(`Failed to read auth file: ${err.message}`);
    return null;
  }
}

// ─── Auth middleware factory ────────────────────────────
function createAuthMiddleware({ enabled, credentials }) {
  if (!enabled || !credentials) {
    return {
      required: false,
      middleware: (_req, _res, next) => next(),
      login: null,
      logout: null,
    };
  }

  function createToken() {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { createdAt: Date.now() });
    return token;
  }

  function isValidToken(token) {
    if (!token || !sessions.has(token)) return false;
    const session = sessions.get(token);
    if (Date.now() - session.createdAt > TOKEN_TTL_MS) {
      sessions.delete(token);
      return false;
    }
    return true;
  }

  function extractToken(req) {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      return header.slice(7).trim();
    }
    return req.headers['x-auth-token'] || '';
  }

  const middleware = (req, res, next) => {
    if (req.path === '/api/health' || req.path === '/api/login') {
      return next();
    }
    const token = extractToken(req);
    if (isValidToken(token)) {
      req.authToken = token;
      return next();
    }
    return res.status(401).json({ error: 'Authentication required' });
  };

  const login = (req, res) => {
    const ip = getClientIp(req);

    if (!checkRateLimit(ip)) {
      const entry = loginFails.get(ip);
      const remaining = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
      return res.status(429).json({
        error: `Too many attempts. Try again in ${remaining} seconds.`,
      });
    }

    const { username, password } = req.body || {};
    if (username === credentials.username && verifyPassword(password || '', credentials.password)) {
      const token = createToken();
      recordLoginSuccess(ip);
      return res.json({ success: true, token });
    }

    recordLoginFail(ip);
    return res.status(401).json({ error: 'Invalid username or password' });
  };

  const logout = (req, res) => {
    const token = extractToken(req);
    if (token) sessions.delete(token);
    res.json({ success: true });
  };

  return { required: true, middleware, login, logout };
}

function resolveAuthFile(shareDir, explicitPath) {
  if (explicitPath) return path.resolve(explicitPath);
  return path.join(path.resolve(shareDir), '.lan-share-auth.json');
}

module.exports = {
  createAuthMiddleware,
  loadCredentials,
  resolveAuthFile,
  hashPassword,
  verifyPassword,
};
