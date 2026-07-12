/**
 * ComfyUI integration for LAN Share.
 *
 * Talks to a running ComfyUI instance over HTTP and manages a small library
 * of API-format workflows stored inside the share directory. Generated files
 * land in ComfyUI's output directory, which is already under SHARE_DIR, so no
 * copying is needed — the browser can preview them through the normal file API.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const COMFY_URL = (process.env.COMFY_URL || 'http://127.0.0.1:8188').replace(/\/+$/, '');
const CLIENT_ID = 'lan-share-' + crypto.randomBytes(4).toString('hex');

// Where LAN Share keeps its own workflow library. Lives under the ComfyUI
// tree so it sits inside SHARE_DIR and survives ComfyUI restarts.
function workflowDir(shareDir) {
  return path.join(shareDir, 'ComfyUI', 'lan-workflows');
}

async function comfyFetch(endpoint, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(COMFY_URL + endpoint, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── ComfyUI status ───────────────────────────────────
async function getStatus() {
  try {
    const res = await comfyFetch('/system_stats', {}, 5000);
    if (!res.ok) return { online: false, error: `HTTP ${res.status}` };
    const stats = await res.json();
    return {
      online: true,
      url: COMFY_URL,
      version: stats.system?.comfyui_version || null,
      python: stats.system?.python_version || null,
      devices: (stats.devices || []).map(d => ({ name: d.name, type: d.type, vram_total: d.vram_total, vram_free: d.vram_free })),
    };
  } catch (err) {
    return { online: false, url: COMFY_URL, error: err.name === 'AbortError' ? 'timeout' : err.message };
  }
}

async function getQueue() {
  const res = await comfyFetch('/queue', {}, 5000);
  if (!res.ok) throw new Error(`Queue fetch failed: HTTP ${res.status}`);
  return res.json();
}

// ─── Workflow library ─────────────────────────────────
function listWorkflows(shareDir) {
  const dir = workflowDir(shareDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && !f.endsWith('.meta.json'))
    .map(f => {
      const name = f.slice(0, -5);
      const metaPath = path.join(dir, `${name}.meta.json`);
      let meta = null;
      if (fs.existsSync(metaPath)) {
        try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch { meta = null; }
      }
      return {
        name,
        title: meta?.title || name,
        description: meta?.description || '',
        fields: meta?.fields || [],
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

function readWorkflow(shareDir, name) {
  const safe = sanitizeName(name);
  const dir = workflowDir(shareDir);
  const wfPath = path.join(dir, `${safe}.json`);
  const metaPath = path.join(dir, `${safe}.meta.json`);
  if (!fs.existsSync(wfPath)) return null;

  const prompt = JSON.parse(fs.readFileSync(wfPath, 'utf-8'));
  let meta = null;
  if (fs.existsSync(metaPath)) {
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch { meta = null; }
  }
  return { name: safe, prompt, meta };
}

function saveWorkflow(shareDir, name, prompt, meta) {
  const safe = sanitizeName(name);
  if (!safe) throw new Error('Invalid workflow name');
  if (!prompt || typeof prompt !== 'object') throw new Error('prompt (API format) required');
  if (!isApiFormat(prompt)) throw new Error('prompt must be ComfyUI API format (node_id -> {class_type, inputs})');

  const dir = workflowDir(shareDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${safe}.json`), JSON.stringify(prompt, null, 2), 'utf-8');
  if (meta && typeof meta === 'object') {
    fs.writeFileSync(path.join(dir, `${safe}.meta.json`), JSON.stringify(meta, null, 2), 'utf-8');
  }
  return safe;
}

function deleteWorkflow(shareDir, name) {
  const safe = sanitizeName(name);
  const dir = workflowDir(shareDir);
  const wfPath = path.join(dir, `${safe}.json`);
  const metaPath = path.join(dir, `${safe}.meta.json`);
  if (!fs.existsSync(wfPath)) return false;
  fs.rmSync(wfPath, { force: true });
  if (fs.existsSync(metaPath)) fs.rmSync(metaPath, { force: true });
  return true;
}

function sanitizeName(name) {
  return String(name || '').replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
}

// API format: top-level object whose values have class_type + inputs.
function isApiFormat(obj) {
  const values = Object.values(obj);
  if (values.length === 0) return false;
  return values.every(v => v && typeof v === 'object' && typeof v.class_type === 'string' && 'inputs' in v);
}

// ─── Parameter overrides ──────────────────────────────
// overrides: [{ node: "3", input: "lyrics", value: "..." }]
function applyOverrides(prompt, overrides) {
  const next = JSON.parse(JSON.stringify(prompt));
  for (const ov of overrides || []) {
    const node = next[String(ov.node)];
    if (!node || !node.inputs) continue;
    if (!(ov.input in node.inputs)) continue;
    // Never overwrite a linked input ([node_id, slot] array)
    if (Array.isArray(node.inputs[ov.input])) continue;
    node.inputs[ov.input] = ov.value;
  }
  return next;
}

// ─── Generate ─────────────────────────────────────────
async function generate(shareDir, name, overrides) {
  const wf = readWorkflow(shareDir, name);
  if (!wf) throw new Error('Workflow not found');

  const prompt = applyOverrides(wf.prompt, overrides);

  const res = await comfyFetch('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, client_id: CLIENT_ID }),
  }, 15000);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI rejected prompt (HTTP ${res.status}): ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`ComfyUI error: ${data.error.message || JSON.stringify(data.error)}`);
  }
  return { prompt_id: data.prompt_id, number: data.number };
}

// Poll /history until the prompt completes, then collect output files as
// SHARE_DIR-relative paths (they live under ComfyUI/output/).
async function waitForResult(shareDir, promptId, { timeoutMs = 600000, intervalMs = 1500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const outputRel = path.join('ComfyUI', 'output');

  while (Date.now() < deadline) {
    const res = await comfyFetch(`/history/${promptId}`, {}, 8000);
    if (res.ok) {
      const hist = await res.json();
      const entry = hist[promptId];
      if (entry) {
        const status = entry.status || {};
        if (status.completed || status.status_str === 'success' || status.status_str === 'error') {
          if (status.status_str === 'error') {
            const msg = extractError(status);
            throw new Error(`Generation failed: ${msg}`);
          }
          const files = collectOutputs(entry.outputs || {}, outputRel);
          return { done: true, files, status: status.status_str || 'success' };
        }
      }
    }
    await sleep(intervalMs);
  }
  throw new Error('Generation timed out');
}

function collectOutputs(outputs, outputRel) {
  const files = [];
  for (const nodeOut of Object.values(outputs)) {
    for (const key of ['images', 'audio', 'gifs', 'video']) {
      for (const item of nodeOut[key] || []) {
        if (item.type && item.type !== 'output') continue; // skip temp/input
        const rel = path.join(outputRel, item.subfolder || '', item.filename);
        files.push({ filename: item.filename, subfolder: item.subfolder || '', path: rel, kind: key });
      }
    }
  }
  return files;
}

function extractError(status) {
  const messages = status.messages || [];
  for (const m of messages) {
    if (Array.isArray(m) && m[0] === 'execution_error') {
      return m[1]?.exception_message || JSON.stringify(m[1]);
    }
  }
  return status.status_str || 'unknown error';
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = {
  COMFY_URL,
  getStatus,
  getQueue,
  listWorkflows,
  readWorkflow,
  saveWorkflow,
  deleteWorkflow,
  generate,
  waitForResult,
  workflowDir,
};
