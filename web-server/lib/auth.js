const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const sessions = new Map();
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
    return data;
  } catch (err) {
    console.warn(`Failed to read auth file: ${err.message}`);
    return null;
  }
}

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
    const { username, password } = req.body || {};
    if (username === credentials.username && password === credentials.password) {
      const token = createToken();
      return res.json({ success: true, token });
    }
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
};