const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

// Setup: create a temp share directory and start the server
const SHARE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lan-share-api-'));
const PORT = 0; // random port
const BASE_DIR = path.resolve(__dirname, '..');

// Create some test files/dirs
fs.mkdirSync(path.join(SHARE_DIR, 'Documents'), { recursive: true });
fs.mkdirSync(path.join(SHARE_DIR, 'Pictures'), { recursive: true });
fs.writeFileSync(path.join(SHARE_DIR, 'Documents', 'hello.txt'), 'Hello World');
fs.writeFileSync(path.join(SHARE_DIR, 'Pictures', 'test.jpg'), Buffer.alloc(100));

let server;
let baseUrl;

// Helper: fetch with JSON parsing
async function apiFetch(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const bodyStr = options.body || null;
    const opts = {
      method: options.method || 'GET',
      headers: Object.assign({}, options.headers || {}),
    };
    if (bodyStr) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const req = http.request(url, opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json, raw: data });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

describe('API Integration', () => {
  before(() => {
    // Set env vars for the server
    process.env.SHARE_DIR = SHARE_DIR;
    process.env.FB_PORT = '0';
    process.env.MAX_FILE_SIZE = '1048576'; // 1MB

    // Start the server and wait for it to be ready
    return new Promise((resolve) => {
      server = require('../server');
      server.on('listening', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  it('GET /api/health returns ok', async () => {
    const res = await apiFetch('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.ok(res.body.uptime !== undefined);
    assert.ok(res.body.version);
  });

  it('GET /api/info returns server info', async () => {
    const res = await apiFetch('/api/info');
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'LAN Share');
    assert.equal(res.body.auth_required, false);
    assert.ok(res.body.max_file_size_human);
  });

  it('GET /api/list returns root directory', async () => {
    const res = await apiFetch('/api/list');
    assert.equal(res.status, 200);
    assert.equal(res.body.path, '');
    assert.ok(Array.isArray(res.body.items));
    // Should contain Documents and Pictures
    const names = res.body.items.map(i => i.name);
    assert.ok(names.includes('Documents'));
    assert.ok(names.includes('Pictures'));
  });

  it('GET /api/list?path=Documents shows subdirectory', async () => {
    const res = await apiFetch('/api/list?path=Documents');
    assert.equal(res.status, 200);
    assert.equal(res.body.path, 'Documents');
    assert.ok(res.body.items.length > 0);
  });

  it('GET /api/list?path=../ blocks traversal', async () => {
    const res = await apiFetch('/api/list?path=../');
    assert.equal(res.status, 403);
  });

  it('GET /api/list?path=../../etc blocks depth traversal', async () => {
    const res = await apiFetch('/api/list?path=../../etc');
    assert.equal(res.status, 403);
  });

  it('POST /api/mkdir creates a directory', async () => {
    const res = await apiFetch('/api/mkdir', {
      method: 'POST',
      body: JSON.stringify({ name: 'NewFolder' }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(fs.existsSync(path.join(SHARE_DIR, 'NewFolder')));
  });

  it('POST /api/mkdir with existing returns 409', async () => {
    const res = await apiFetch('/api/mkdir', {
      method: 'POST',
      body: JSON.stringify({ name: 'NewFolder' }),
    });
    assert.equal(res.status, 409);
  });

  it('POST /api/rename renames a file', async () => {
    const res = await apiFetch('/api/rename', {
      method: 'POST',
      body: JSON.stringify({ from: 'Documents/hello.txt', to: 'Documents/renamed.txt' }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(fs.existsSync(path.join(SHARE_DIR, 'Documents', 'renamed.txt')));
    assert.ok(!fs.existsSync(path.join(SHARE_DIR, 'Documents', 'hello.txt')));
  });

  it('POST /api/rename moves file across directories', async () => {
    const res = await apiFetch('/api/rename', {
      method: 'POST',
      body: JSON.stringify({ from: 'Documents/renamed.txt', to: 'Pictures/moved.txt' }),
    });
    assert.equal(res.status, 200);
    assert.ok(fs.existsSync(path.join(SHARE_DIR, 'Pictures', 'moved.txt')));
  });

  it('POST /api/rename with missing source returns 404', async () => {
    const res = await apiFetch('/api/rename', {
      method: 'POST',
      body: JSON.stringify({ from: 'nonexistent.txt', to: 'new.txt' }),
    });
    assert.equal(res.status, 404);
  });

  it('POST /api/rename with existing target returns 409', async () => {
    // Create target file
    fs.writeFileSync(path.join(SHARE_DIR, 'Pictures', 'target.txt'), 'target');
    const res = await apiFetch('/api/rename', {
      method: 'POST',
      body: JSON.stringify({ from: 'Pictures/moved.txt', to: 'Pictures/target.txt' }),
    });
    assert.equal(res.status, 409);
  });

  it('DELETE /api/delete removes a file', async () => {
    // Ensure target file exists first
    fs.writeFileSync(path.join(SHARE_DIR, 'Pictures', 'to-delete.txt'), 'delete me');
    const res = await apiFetch('/api/delete', {
      method: 'DELETE',
      body: JSON.stringify({ path: 'Pictures/to-delete.txt' }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(!fs.existsSync(path.join(SHARE_DIR, 'Pictures', 'to-delete.txt')));
  });

  it('DELETE /api/delete with missing path returns 404', async () => {
    const res = await apiFetch('/api/delete', {
      method: 'DELETE',
      body: JSON.stringify({ path: 'nonexistent.txt' }),
    });
    assert.equal(res.status, 404);
  });

  it('GET /api/content reads file content', async () => {
    const res = await apiFetch('/api/content?path=Pictures/moved.txt');
    assert.equal(res.status, 200);
    // moved.txt was created by renaming hello.txt which had "Hello World"
    assert.equal(res.body.content, 'Hello World');
  });

  it('PUT /api/save saves file content', async () => {
    const res = await apiFetch('/api/save', {
      method: 'PUT',
      body: JSON.stringify({ path: 'Pictures/moved.txt', content: 'Updated content' }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const content = fs.readFileSync(path.join(SHARE_DIR, 'Pictures', 'moved.txt'), 'utf-8');
    assert.equal(content, 'Updated content');
  });

  it('GET /api/search finds files', async () => {
    const res = await apiFetch('/api/search?q=moved');
    assert.equal(res.status, 200);
    assert.ok(res.body.items.length > 0);
    assert.ok(res.body.items.some(i => i.name.includes('moved')));
  });

  it('GET /api/search with empty query returns empty', async () => {
    const res = await apiFetch('/api/search?q=');
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 0);
  });

  it('GET /files/ returns files for download', async () => {
    const res = await apiFetch('/files/Pictures/moved.txt');
    assert.equal(res.status, 200);
    assert.equal(res.raw, 'Updated content');
  });

  it('GET /files/ with ?download=1 forces download', async () => {
    const res = await apiFetch('/files/Pictures/test.jpg?download=1');
    assert.equal(res.status, 200);
  });

  it('GET /files/ blocks traversal via encoded path', async () => {
    // Express normalizes plain ../ in URL before routing, so use URL-encoded
    const res = await apiFetch('/files/..%2f..%2fetc%2fpasswd');
    assert.equal(res.status, 403);
  });

  it('GET /files/ not found returns 404', async () => {
    const res = await apiFetch('/files/nonexistent.txt');
    assert.equal(res.status, 404);
  });

  // Cleanup: close server and remove test dirs
  after(() => {
    try {
      fs.rmSync(path.join(SHARE_DIR, 'Pictures', 'moved.txt'), { force: true });
      fs.rmSync(path.join(SHARE_DIR, 'NewFolder'), { recursive: true, force: true });
    } catch {}
    try { server.close(); } catch {}
  });
});
