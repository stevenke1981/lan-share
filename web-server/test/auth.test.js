const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Must set env vars before requiring auth module (rate limits)
process.env.MAX_LOGIN_FAILS = '3';
process.env.LOGIN_LOCK_MS = '500';

const {
  createAuthMiddleware,
  loadCredentials,
  resolveAuthFile,
  hashPassword,
  verifyPassword,
} = require('../lib/auth');

// ─── Password hashing ─────────────────────────────────
describe('hashPassword / verifyPassword', () => {
  it('produces scrypt$salt$hash format', () => {
    const hashed = hashPassword('secret123');
    const parts = hashed.split('$');
    assert.equal(parts.length, 3);
    assert.equal(parts[0], 'scrypt');
    assert.equal(parts[1].length, 32); // 16 bytes hex
    assert.equal(parts[2].length, 64); // 32 bytes hex
  });

  it('verifies correct password', () => {
    const hashed = hashPassword('correct-horse');
    assert.equal(verifyPassword('correct-horse', hashed), true);
  });

  it('rejects wrong password', () => {
    const hashed = hashPassword('correct-horse');
    assert.equal(verifyPassword('wrong-password', hashed), false);
  });

  it('handles plaintext compatibility', () => {
    assert.equal(verifyPassword('plain-secret', 'plain-secret'), true);
    assert.equal(verifyPassword('wrong', 'plain-secret'), false);
  });

  it('rejects malformed hash', () => {
    assert.equal(verifyPassword('x', 'scrypt$tooshort'), false);
    assert.equal(verifyPassword('x', 'scrypt$abc$'), false);
  });

  it('different salts produce different hashes', () => {
    const h1 = hashPassword('same');
    const h2 = hashPassword('same');
    assert.notEqual(h1, h2);
    assert.equal(verifyPassword('same', h1), true);
    assert.equal(verifyPassword('same', h2), true);
  });
});

// ─── Token management ─────────────────────────────────
describe('Auth middleware — token management', () => {
  let auth;

  before(() => {
    auth = createAuthMiddleware({
      enabled: true,
      credentials: { username: 'admin', password: hashPassword('secret') },
    });
  });

  it('createAuthMiddleware returns required:true', () => {
    assert.equal(auth.required, true);
    assert.ok(typeof auth.middleware === 'function');
    assert.ok(typeof auth.login === 'function');
    assert.ok(typeof auth.logout === 'function');
  });

  it('createAuthMiddleware disabled when no credentials', () => {
    const noAuth = createAuthMiddleware({ enabled: true, credentials: null });
    assert.equal(noAuth.required, false);
    assert.equal(noAuth.login, null);
  });

  it('disables when enabled=false', () => {
    const noAuth = createAuthMiddleware({ enabled: false, credentials: { username: 'a', password: 'b' } });
    assert.equal(noAuth.required, false);
  });

  // Test token flow using mock req/res
  function makeReqRes(headers = {}, path = '/api/list') {
    const req = { headers, path, body: {} };
    const res = {
      _status: 200,
      _json: null,
      _ended: false,
      status(code) { this._status = code; return this; },
      json(data) { this._json = data; this._ended = true; return this; },
      end() { this._ended = true; },
    };
    return { req, res };
  }

  it('login with correct credentials returns token', () => {
    const { req, res } = makeReqRes({ 'content-type': 'application/json' }, '/api/login');
    req.body = { username: 'admin', password: 'secret' };
    req.socket = { remoteAddress: '127.0.0.1' };
    auth.login(req, res);

    assert.equal(res._status, 200);
    assert.ok(res._json.token);
    assert.equal(res._json.success, true);

    // Verify the token works
    const token = res._json.token;
    const { req: req2, res: res2 } = makeReqRes({ authorization: `Bearer ${token}` });
    auth.middleware(req2, res2, () => {});
    assert.equal(res2._status, 200); // middleware calls next() → status stays 200
  });

  it('login with wrong credentials returns 401', () => {
    const { req, res } = makeReqRes({ 'content-type': 'application/json' }, '/api/login');
    req.body = { username: 'admin', password: 'wrong' };
    req.socket = { remoteAddress: '127.0.0.2' };
    auth.login(req, res);

    assert.equal(res._status, 401);
    assert.equal(res._json.error, 'Invalid username or password');
  });

  it('middleware rejects missing token', () => {
    const { req, res } = makeReqRes({}, '/api/list');
    let nextCalled = false;
    auth.middleware(req, res, () => { nextCalled = true; });

    assert.equal(res._status, 401);
    assert.equal(res._json.error, 'Authentication required');
    assert.equal(nextCalled, false);
  });

  it('allows /api/health and /api/login without token', () => {
    const { req: r1, res: rs1 } = makeReqRes({}, '/api/health');
    let called1 = false;
    auth.middleware(r1, rs1, () => { called1 = true; });
    assert.equal(called1, true);

    const { req: r2, res: rs2 } = makeReqRes({}, '/api/login');
    let called2 = false;
    auth.middleware(r2, rs2, () => { called2 = true; });
    assert.equal(called2, true);
  });

  it('supports X-Auth-Token header', () => {
    // First login to get a token
    const { req: loginReq, res: loginRes } = makeReqRes({ 'content-type': 'application/json' }, '/api/login');
    loginReq.body = { username: 'admin', password: 'secret' };
    loginReq.socket = { remoteAddress: '127.0.0.3' };
    auth.login(loginReq, loginRes);
    const token = loginRes._json.token;

    // Use X-Auth-Token
    const { req, res } = makeReqRes({ 'x-auth-token': token }, '/api/list');
    let called = false;
    auth.middleware(req, res, () => { called = true; });
    assert.equal(called, true);
  });
});

// ─── Rate limiting ────────────────────────────────────
describe('Rate limiting', () => {
  let auth;

  before(() => {
    // Reset the internal state by creating fresh middleware
    auth = createAuthMiddleware({
      enabled: true,
      credentials: { username: 'test', password: 'pass' },
    });
  });

  it('locks after MAX_LOGIN_FAILS attempts', () => {
    // Exhaust attempts
    for (let i = 0; i < 3; i++) {
      const { req, res } = { 
        req: { body: { username: 'test', password: 'wrong' }, headers: {}, socket: { remoteAddress: '10.0.0.1' }, ip: '10.0.0.1' },
        res: { 
          _status: 200, _json: null, _ended: false,
          status(code) { this._status = code; return this; },
          json(data) { this._json = data; this._ended = true; },
          end() { this._ended = true; },
        } 
      };
      auth.login(req, res);
      // First 3 should be 401
      if (i < 2) {
        assert.equal(res._status, 401);
      }
    }

    // 4th attempt should be rate limited
    const { req, res } = { 
      req: { body: { username: 'test', password: 'wrong' }, headers: {}, socket: { remoteAddress: '10.0.0.1' }, ip: '10.0.0.1' },
      res: { 
        _status: 200, _json: null, _ended: false,
        status(code) { this._status = code; return this; },
        json(data) { this._json = data; this._ended = true; },
        end() { this._ended = true; },
      } 
    };
    auth.login(req, res);
    assert.equal(res._status, 429);
    assert.ok(res._json.error.includes('Too many attempts'));
  });

  it('allows login after lock expires', (_, done) => {
    // Wait for lock to expire (500ms)
    setTimeout(() => {
      const { req, res } = { 
        req: { body: { username: 'test', password: 'pass' }, headers: {}, socket: { remoteAddress: '10.0.0.1' }, ip: '10.0.0.1' },
        res: { 
          _status: 200, _json: null, _ended: false,
          status(code) { this._status = code; return this; },
          json(data) { this._json = data; this._ended = true; },
          end() { this._ended = true; },
        } 
      };
      auth.login(req, res);
      assert.equal(res._status, 200);
      assert.ok(res._json.token);
      done();
    }, 600);
  });
});

// ─── loadCredentials ─────────────────────────────────
describe('loadCredentials', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lan-share-auth-test-'));

  it('returns null for missing auth file', () => {
    const creds = loadCredentials(path.join(tmpDir, 'nonexistent.json'));
    assert.equal(creds, null);
  });

  it('loads valid auth file', () => {
    const authFile = path.join(tmpDir, 'auth.json');
    fs.writeFileSync(authFile, JSON.stringify({ username: 'admin', password: hashPassword('secret') }));
    const creds = loadCredentials(authFile);
    assert.equal(creds.username, 'admin');
    assert.ok(creds.password.startsWith('scrypt$'));
  });

  it('rejects auth file without username', () => {
    const authFile = path.join(tmpDir, 'bad-auth.json');
    fs.writeFileSync(authFile, JSON.stringify({ password: 'x' }));
    const creds = loadCredentials(authFile);
    assert.equal(creds, null);
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('resolveAuthFile', () => {
  it('uses explicit path if provided', () => {
    const result = resolveAuthFile('/share', '/custom/auth.json');
    assert.equal(result, '/custom/auth.json');
  });

  it('defaults to .lan-share-auth.json in share dir', () => {
    const result = resolveAuthFile('/mnt/lan-share', undefined);
    assert.equal(result, '/mnt/lan-share/.lan-share-auth.json');
  });
});
