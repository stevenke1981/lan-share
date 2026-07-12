/**
 * LAN Share — Web File Browser
 *
 * A lightweight file server for your home network.
 * Browse, download, upload, and preview files from any device.
 *
 * Usage: node server.js
 *        node server.js --dir /path/to/share
 *        node server.js --port 8080
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const mime = require('mime-types');
const { stripC2pa } = require('./strip-c2pa');
const { categorize, normalizeFilename } = require('./categorize');
const {
  PathTraversalError,
  resolveSafePath,
  resolveRealSafePath,
  resolveRealSafeParent,
} = require('./lib/path-utils');
const {
  createAuthMiddleware,
  loadCredentials,
  resolveAuthFile,
  hashPassword,
  verifyPassword,
} = require('./lib/auth');

// Read version from package.json (single source of truth)
const pkg = require('./package.json');
const VERSION = pkg.version || '1.3.0';
const comfyui = require('./comfyui');

// ─── Configuration ────────────────────────────────────
const SHARE_DIR = path.resolve(process.argv.includes('--dir')
  ? process.argv[process.argv.indexOf('--dir') + 1]
  : process.env.SHARE_DIR || '/mnt/lan-share');
const PORT = parseInt(process.argv.includes('--port')
  ? process.argv[process.argv.indexOf('--port') + 1]
  : process.env.FB_PORT || process.env.WEB_PORT || '8080', 10);
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || (500 * 1024 * 1024).toString(), 10);
const AUTH_METHOD = (process.env.AUTH_METHOD || 'noauth').toLowerCase();
const AUTH_FILE = resolveAuthFile(SHARE_DIR, process.env.AUTH_FILE);

// Search limits
const MAX_SEARCH_DEPTH = parseInt(process.env.MAX_SEARCH_DEPTH || '12', 10);
const MAX_SEARCH_RESULTS = 100;

// ─── Ensure share directory exists ────────────────────
if (!fs.existsSync(SHARE_DIR)) {
  console.error(`Share directory does not exist: ${SHARE_DIR}`);
  process.exit(1);
}

function seedComfyWorkflows() {
  const srcDir = path.join(__dirname, 'seed-workflows');
  if (!fs.existsSync(srcDir)) return;
  const destDir = comfyui.workflowDir(SHARE_DIR);
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    if (!file.endsWith('.json')) continue;
    const src = path.join(srcDir, file);
    const dest = path.join(destDir, file);
    if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
  }
}

seedComfyWorkflows();

const app = express();
app.use(express.json({ limit: '10mb' })); // reduced from 50mb — uploads go through multer

const authCredentials = AUTH_METHOD === 'json' ? loadCredentials(AUTH_FILE) : null;
const auth = createAuthMiddleware({
  enabled: AUTH_METHOD === 'json',
  credentials: authCredentials,
});

const PUBLIC_API_PATHS = new Set(['/api/health', '/api/info', '/api/login']);

app.use((req, res, next) => {
  if (!auth.required) return next();
  if (PUBLIC_API_PATHS.has(req.path)) return next();
  if (req.path.startsWith('/api/') || req.path.startsWith('/files/')) {
    return auth.middleware(req, res, next);
  }
  return next();
});

// ─── Multer upload (auto-categorize + normalize Chinese filenames) ───
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Normalize filename for Chinese characters
    file.normalizedName = normalizeFilename(file.originalname);

    // Auto-categorize: place in correct subdirectory based on file type
    const category = categorize(file.normalizedName);
    const uploadDir = path.join(SHARE_DIR, category);
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    let name = file.normalizedName;
    const dest = path.join(SHARE_DIR, categorize(name), name);
    if (fs.existsSync(dest)) {
      const ext = path.extname(name);
      const base = path.basename(name, ext);
      let counter = 1;
      while (fs.existsSync(path.join(path.dirname(dest), `${base} (${counter})${ext}`))) {
        counter++;
      }
      name = `${base} (${counter})${ext}`;
    }
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
});

// ─── Helpers ──────────────────────────────────────────
function safeResolve(relPath) {
  return resolveRealSafePath(SHARE_DIR, relPath);
}

function safeResolveParent(relPath) {
  return resolveRealSafeParent(SHARE_DIR, relPath);
}

function handleRouteError(res, err) {
  if (err instanceof PathTraversalError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  if (err.code === 'ENOENT') {
    return res.status(404).json({ error: 'Path not found' });
  }
  return res.status(500).json({ error: err.message });
}

function getRelativePath(absolutePath) {
  const rel = path.relative(SHARE_DIR, absolutePath);
  return rel || '';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}

function getFileIcon(name) {
  const ext = path.extname(name).toLowerCase();
  const iconMap = {
    '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.gif': '🖼️', '.webp': '🖼️', '.svg': '🖼️', '.bmp': '🖼️', '.ico': '🖼️',
    '.mp4': '🎬', '.avi': '🎬', '.mkv': '🎬', '.mov': '🎬', '.wmv': '🎬', '.webm': '🎬',
    '.mp3': '🎵', '.wav': '🎵', '.flac': '🎵', '.aac': '🎵', '.ogg': '🎵', '.m4a': '🎵',
    '.zip': '📦', '.tar': '📦', '.gz': '📦', '.7z': '📦', '.rar': '📦',
    '.pdf': '📄', '.doc': '📄', '.docx': '📄', '.xls': '📄', '.xlsx': '📄', '.ppt': '📄', '.pptx': '📄',
    '.txt': '📝', '.md': '📝', '.json': '📝', '.csv': '📝', '.xml': '📝', '.log': '📝',
    '.js': '⚙️', '.ts': '⚙️', '.py': '⚙️', '.sh': '⚙️', '.html': '🌐', '.css': '🎨',
    '.exe': '⚡', '.deb': '📦', '.AppImage': '📦',
  };
  return iconMap[ext] || '📄';
}

function isPreviewable(filename) {
  const ext = path.extname(filename).toLowerCase();
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
  const audioExts = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'];
  const textExts = ['.txt', '.md', '.json', '.csv', '.xml', '.log', '.yaml', '.yml', '.toml',
                    '.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.sh', '.bash', '.html', '.css',
                    '.sql', '.ini', '.cfg', '.conf', '.env'];
  const pdfExts = ['.pdf'];
  return [...imageExts, ...videoExts, ...audioExts, ...textExts, ...pdfExts].includes(ext);
}

function getPreviewType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'].includes(ext)) return 'image';
  if (['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'].includes(ext)) return 'audio';
  if (['.txt', '.md', '.json', '.csv', '.xml', '.log', '.yaml', '.yml', '.toml',
       '.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.sh', '.bash', '.html', '.css',
       '.sql', '.ini', '.cfg', '.conf', '.env'].includes(ext)) return 'text';
  if (ext === '.pdf') return 'pdf';
  return null;
}

// Async version of listDir
async function listDirAsync(dirPath) {
  const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // skip hidden
    const fullPath = path.join(dirPath, entry.name);
    const stat = await fsPromises.stat(fullPath);

    items.push({
      name: entry.name,
      path: getRelativePath(fullPath),
      is_dir: entry.isDirectory(),
      size: entry.isDirectory() ? null : stat.size,
      size_human: entry.isDirectory() ? '' : formatFileSize(stat.size),
      icon: entry.isDirectory() ? '📁' : getFileIcon(entry.name),
      previewable: !entry.isDirectory() && isPreviewable(entry.name),
      preview_type: !entry.isDirectory() ? getPreviewType(entry.name) : null,
      mtime: stat.mtime.toISOString(),
    });
  }

  // Sort: directories first, then by name
  items.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return items;
}

// ─── API Routes ───────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    share_dir: SHARE_DIR,
    version: VERSION,
  });
});

app.get('/api/info', (_req, res) => {
  res.json({
    name: 'LAN Share',
    version: VERSION,
    share_dir: SHARE_DIR,
    max_file_size: MAX_FILE_SIZE,
    max_file_size_human: formatFileSize(MAX_FILE_SIZE),
    auth_required: auth.required,
  });
});

if (auth.login) {
  app.post('/api/login', auth.login);
  app.post('/api/logout', auth.logout);
}

// GET /api/list?path=... — list directory contents (async)
app.get('/api/list', async (req, res) => {
  try {
    const relPath = req.query.path || '';
    const targetPath = safeResolve(relPath);

    try {
      const stat = await fsPromises.stat(targetPath);
      if (!stat.isDirectory()) {
        return res.status(400).json({ error: 'Not a directory' });
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Path not found' });
      }
      throw err;
    }

    const items = await listDirAsync(targetPath);
    const breadcrumbs = getRelativePath(targetPath).split(path.sep).filter(Boolean);

    res.json({
      path: getRelativePath(targetPath),
      breadcrumbs,
      items,
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// POST /api/upload — upload files
app.post('/api/upload', (req, res, next) => {
  upload.array('files', 50)(req, res, (err) => {
    if (err) return next(err);
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files received' });
    }

    const results = req.files.map(f => ({
      name: f.filename,
      original_name: f.originalname,
      size: f.size,
      size_human: formatFileSize(f.size),
      path: getRelativePath(f.path),
    }));

    res.json({ success: true, files: results });
  });
});

// POST /api/mkdir — create directory (async)
app.post('/api/mkdir', async (req, res) => {
  try {
    const relPath = req.body.path || '';
    const dirName = req.body.name;
    if (!dirName) return res.status(400).json({ error: 'Name required' });
    if (/[\\/]/.test(dirName) || dirName.includes('..')) {
      return res.status(400).json({ error: 'Invalid folder name' });
    }

    const parentPath = safeResolveParent(relPath);
    const targetPath = path.join(parentPath, dirName);
    // Validate target is within share dir
    resolveSafePath(SHARE_DIR, path.relative(SHARE_DIR, targetPath));

    try {
      await fsPromises.access(targetPath);
      return res.status(409).json({ error: 'Already exists' });
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }

    await fsPromises.mkdir(targetPath, { recursive: true });
    res.json({ success: true, path: getRelativePath(targetPath) });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// DELETE /api/delete — delete file or directory (async)
app.delete('/api/delete', async (req, res) => {
  try {
    const relPath = req.body.path;
    if (!relPath) return res.status(400).json({ error: 'Path required' });

    const targetPath = safeResolve(relPath);
    try {
      await fsPromises.access(targetPath);
    } catch (e) {
      if (e.code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
      throw e;
    }

    await fsPromises.rm(targetPath, { recursive: true, force: true });
    res.json({ success: true });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// GET /api/search?q=... — search files (async + depth limit + cycle protection)
app.get('/api/search', async (req, res) => {
  try {
    const query = (req.query.q || '').toLowerCase();
    if (!query) return res.json({ items: [] });

    const results = [];
    const visited = new Set();

    async function walk(dirPath, depth) {
      if (depth > MAX_SEARCH_DEPTH) return;
      if (results.length >= MAX_SEARCH_RESULTS) return;

      // Cycle protection: track realpath
      let realDir;
      try {
        realDir = await fsPromises.realpath(dirPath);
      } catch {
        return; // inaccessible, skip
      }
      if (visited.has(realDir)) return;
      visited.add(realDir);

      let entries;
      try {
        entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      } catch {
        return; // permission error, skip
      }

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (results.length >= MAX_SEARCH_RESULTS) break;
        const fullPath = path.join(dirPath, entry.name);

        if (entry.name.toLowerCase().includes(query)) {
          let stat;
          try {
            stat = await fsPromises.stat(fullPath);
          } catch {
            continue; // broken symlink, skip
          }
          results.push({
            name: entry.name,
            path: getRelativePath(fullPath),
            is_dir: entry.isDirectory(),
            size_human: entry.isDirectory() ? '' : formatFileSize(stat.size),
            icon: entry.isDirectory() ? '📁' : getFileIcon(entry.name),
          });
        }
        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1);
        }
      }
    }

    await walk(SHARE_DIR, 0);
    res.json({ items: results });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// PUT /api/save — save file content (text editing, async)
app.put('/api/save', async (req, res) => {
  try {
    const relPath = req.body.path;
    const content = req.body.content;

    if (!relPath || content === undefined) {
      return res.status(400).json({ error: 'Path and content required' });
    }

    const filePath = safeResolveParent(relPath);
    try {
      await fsPromises.access(filePath);
    } catch (e) {
      if (e.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
      throw e;
    }

    await fsPromises.writeFile(filePath, content, 'utf-8');
    res.json({ success: true });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// POST /api/remove-c2pa — strip C2PA/metadata from image (async)
app.post('/api/remove-c2pa', async (req, res) => {
  try {
    const relPath = req.body.path;
    if (!relPath) return res.status(400).json({ error: 'Path required' });

    const filePath = safeResolve(relPath);
    try {
      await fsPromises.access(filePath);
    } catch (e) {
      if (e.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
      throw e;
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.jpg' && ext !== '.jpeg' && ext !== '.png') {
      return res.status(400).json({ error: 'Only JPEG and PNG are supported' });
    }

    // Generate output filename: original name + _clean
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, ext);
    const newName = `${base}_clean${ext}`;
    const outputPath = path.join(dir, newName);

    // StripC2PA is synchronous (CPU-bound small files) — ok to keep sync
    const success = stripC2pa(filePath, outputPath);
    if (!success) {
      return res.status(500).json({ error: 'Failed to remove metadata' });
    }

    const stat = await fsPromises.stat(outputPath);
    res.json({
      success: true,
      file: {
        name: newName,
        path: getRelativePath(outputPath),
        size: stat.size,
        size_human: formatFileSize(stat.size),
      },
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// GET /api/content?path=... — get text file content for editing (async)
app.get('/api/content', async (req, res) => {
  try {
    const relPath = req.query.path || '';
    if (!relPath) return res.status(400).json({ error: 'Path required' });

    const filePath = safeResolve(relPath);
    try {
      await fsPromises.access(filePath);
    } catch (e) {
      if (e.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
      throw e;
    }

    const content = await fsPromises.readFile(filePath, 'utf-8');
    res.json({ content });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// POST /api/upload-edited — save edited image (base64, async)
app.post('/api/upload-edited', async (req, res) => {
  try {
    const { path: relPath, dataUrl } = req.body;
    if (!relPath || !dataUrl) {
      return res.status(400).json({ error: 'Path and dataUrl required' });
    }

    // Decode base64
    const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid data URL' });
    }

    const ext = matches[1] === 'jpeg' ? '.jpg' : '.' + matches[1];
    const buffer = Buffer.from(matches[2], 'base64');

    // Generate new filename
    const originalPath = safeResolve(relPath);
    const dir = path.dirname(originalPath);
    const base = path.basename(originalPath, path.extname(originalPath));
    const newName = `${base}_edited${ext}`;
    const outputPath = path.join(dir, newName);

    // Ensure directory exists (parent must be safe)
    const parentReal = safeResolveParent(path.relative(SHARE_DIR, dir));
    await fsPromises.mkdir(parentReal, { recursive: true });

    // Handle overwrites
    let finalName = newName;
    let finalPath = outputPath;
    let counter = 1;
    while (true) {
      try {
        await fsPromises.access(finalPath);
        finalName = `${base}_edited(${counter})${ext}`;
        finalPath = path.join(dir, finalName);
        counter++;
      } catch (e) {
        if (e.code === 'ENOENT') break;
        throw e;
      }
    }

    await fsPromises.writeFile(finalPath, buffer);

    res.json({
      success: true,
      file: {
        name: finalName,
        path: getRelativePath(finalPath),
        size: buffer.length,
        size_human: formatFileSize(buffer.length),
      },
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// POST /api/rename — rename or move file/directory
app.post('/api/rename', async (req, res) => {
  try {
    const { from, to } = req.body;
    if (!from || !to) {
      return res.status(400).json({ error: 'Both "from" and "to" paths required' });
    }

    if (to.includes('..') || /[\\/]/.test(path.basename(to))) {
      return res.status(400).json({ error: 'Invalid target path' });
    }

    // Source must exist
    let sourcePath;
    try {
      sourcePath = safeResolve(from);
      await fsPromises.access(sourcePath);
    } catch (e) {
      if (e.code === 'ENOENT') return res.status(404).json({ error: 'Source not found' });
      throw e;
    }

    // Target: validate parent directory is safe
    const targetPath = safeResolveParent(to);

    // Check if target already exists
    try {
      await fsPromises.access(targetPath);
      return res.status(409).json({ error: 'Target already exists' });
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }

    // Rename across devices: handle EXDEV by copy+delete
    try {
      await fsPromises.rename(sourcePath, targetPath);
    } catch (err) {
      if (err.code === 'EXDEV') {
        // Cross-device: copy then delete
        const stat = await fsPromises.stat(sourcePath);
        if (stat.isDirectory()) {
          await copyDirRecursive(sourcePath, targetPath);
          await fsPromises.rm(sourcePath, { recursive: true, force: true });
        } else {
          await fsPromises.copyFile(sourcePath, targetPath);
          await fsPromises.unlink(sourcePath);
        }
      } else {
        throw err;
      }
    }

    res.json({ success: true, path: getRelativePath(targetPath) });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// Helper: recursive directory copy for cross-device rename
async function copyDirRecursive(src, dest) {
  await fsPromises.mkdir(dest, { recursive: true });
  const entries = await fsPromises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fsPromises.copyFile(srcPath, destPath);
    }
  }
}

// ─── Serve files (for download/preview) — HTTP Range support ───
const STREAMABLE_EXTS = new Set([
  '.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v',
  '.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.opus',
  '.pdf',
]);

app.get('/files/*', async (req, res) => {
  let filePath;
  try {
    const relPath = req.params[0] || '';
    filePath = safeResolve(relPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).send('Not found');
    }
    return res.status(err.statusCode || 403).send(err.message);
  }

  try {
    await fsPromises.access(filePath);
  } catch {
    return res.status(404).send('Not found');
  }

  const stat = await fsPromises.stat(filePath);
  if (stat.isDirectory()) {
    return res.redirect('/?path=' + encodeURIComponent(req.params[0] || ''));
  }

  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  // Force download if ?download=1
  const isDownload = req.query.download === '1';

  if (isDownload) {
    res.download(filePath, fileName);
    return;
  }

  // For non-streamable files, use sendFile as before
  if (!STREAMABLE_EXTS.has(ext)) {
    // Images, text files, etc. use the existing sendFile behavior
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'].includes(ext) ||
        ['.txt', '.md', '.json', '.csv', '.xml', '.log', '.yaml', '.yml', '.toml',
         '.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.sh', '.bash', '.html', '.css',
         '.sql', '.ini', '.cfg', '.conf', '.env'].includes(ext)) {
      res.sendFile(filePath);
      return;
    }
    // Other non-streamable files: download
    res.download(filePath, fileName);
    return;
  }

  // ─── HTTP Range streaming ──────────────────────────
  const fileSize = stat.size;
  const contentType = mime.lookup(filePath) || 'application/octet-stream';
  const rangeHeader = req.headers.range;

  if (!rangeHeader) {
    // No range header: send full file with Accept-Ranges
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': 'inline',
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Parse range header
  const parts = rangeHeader.replace(/bytes=/, '').split('-');
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

  if (isNaN(start) || isNaN(end) || start > end || start >= fileSize) {
    res.writeHead(416, {
      'Content-Range': `bytes */${fileSize}`,
    });
    return res.end();
  }

  const chunkSize = Math.min(end - start + 1, fileSize - start);
  const stream = fs.createReadStream(filePath, { start, end: start + chunkSize - 1 });

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${start + chunkSize - 1}/${fileSize}`,
    'Content-Type': contentType,
    'Content-Length': chunkSize,
    'Accept-Ranges': 'bytes',
    'Content-Disposition': 'inline',
  });

  stream.pipe(res);
});

// ─── Error handling ───────────────────────────────────
app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `File too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}`,
      });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(500).json({ error: err.message });
  }
  return next();
});

// ─── Serve frontend ───────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// Fallback: all other routes serve index.html (SPA-style)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }

  console.log('');
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║       LAN Share — Web File Browser       ║');
  console.log(`║       Version ${VERSION.padEnd(31)}║`);
  console.log('╠═══════════════════════════════════════════╣');
  console.log(`║  Local:   http://localhost:${PORT}            ║`);
  for (const addr of addresses) {
    console.log(`║  LAN:     http://${addr}:${PORT}               ║`);
  }
  console.log(`║  Share:   ${SHARE_DIR}`);
  console.log('╠═══════════════════════════════════════════╣');
  if (auth.required) {
    console.log('║  Auth:     Password login required       ║');
  } else {
    console.log('║  No login required — home LAN use only   ║');
  }
  console.log('╚═══════════════════════════════════════════╝');
  console.log('');
});

// ─── Graceful shutdown ────────────────────────────────
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`\nReceived ${sig}. Shutting down gracefully...`);
    server.close(() => {
      console.log('Server closed. Goodbye!');
      process.exit(0);
    });
    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      console.error('Forced shutdown after timeout.');
      process.exit(1);
    }, 10000).unref();
  });
}

module.exports = server;
