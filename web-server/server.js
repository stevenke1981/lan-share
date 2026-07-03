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
const os = require('os');
const { stripC2pa } = require('./strip-c2pa');
const { categorize, normalizeFilename } = require('./categorize');
const { PathTraversalError, resolveSafePath } = require('./lib/path-utils');
const {
  createAuthMiddleware,
  loadCredentials,
  resolveAuthFile,
} = require('./lib/auth');

const VERSION = '1.2.0';

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

// ─── Ensure share directory exists ────────────────────
if (!fs.existsSync(SHARE_DIR)) {
  console.error(`Share directory does not exist: ${SHARE_DIR}`);
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '50mb' }));

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
  return resolveSafePath(SHARE_DIR, relPath);
}

function handleRouteError(res, err) {
  if (err instanceof PathTraversalError) {
    return res.status(err.statusCode).json({ error: err.message });
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

function listDir(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // skip hidden
    const fullPath = path.join(dirPath, entry.name);
    const stat = fs.statSync(fullPath);

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

// GET /api/list?path=... — list directory contents
app.get('/api/list', (req, res) => {
  try {
    const relPath = req.query.path || '';
    const targetPath = safeResolve(relPath);

    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'Path not found' });
    }
    if (!fs.statSync(targetPath).isDirectory()) {
      return res.status(400).json({ error: 'Not a directory' });
    }

    const items = listDir(targetPath);
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

// POST /api/mkdir — create directory
app.post('/api/mkdir', (req, res) => {
  try {
    const relPath = req.body.path || '';
    const dirName = req.body.name;
    if (!dirName) return res.status(400).json({ error: 'Name required' });
    if (/[\\/]/.test(dirName) || dirName.includes('..')) {
      return res.status(400).json({ error: 'Invalid folder name' });
    }

    const parentPath = safeResolve(relPath);
    const targetPath = path.join(parentPath, dirName);
    safeResolve(path.relative(SHARE_DIR, targetPath));
    if (fs.existsSync(targetPath)) {
      return res.status(409).json({ error: 'Already exists' });
    }

    fs.mkdirSync(targetPath, { recursive: true });
    res.json({ success: true, path: getRelativePath(targetPath) });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// DELETE /api/delete — delete file or directory
app.delete('/api/delete', (req, res) => {
  try {
    const relPath = req.body.path;
    if (!relPath) return res.status(400).json({ error: 'Path required' });

    const targetPath = safeResolve(relPath);
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    fs.rmSync(targetPath, { recursive: true, force: true });
    res.json({ success: true });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// GET /api/search?q=... — search files
app.get('/api/search', (req, res) => {
  try {
    const query = (req.query.q || '').toLowerCase();
    if (!query) return res.json({ items: [] });

    const results = [];
    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (results.length >= 100) break;
        const fullPath = path.join(dir, entry.name);
        if (entry.name.toLowerCase().includes(query)) {
          const stat = fs.statSync(fullPath);
          results.push({
            name: entry.name,
            path: getRelativePath(fullPath),
            is_dir: entry.isDirectory(),
            size_human: entry.isDirectory() ? '' : formatFileSize(stat.size),
            icon: entry.isDirectory() ? '📁' : getFileIcon(entry.name),
          });
        }
        if (entry.isDirectory()) walk(fullPath);
      }
    }
    walk(SHARE_DIR);
    res.json({ items: results });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// PUT /api/save — save file content (text editing)
app.put('/api/save', (req, res) => {
  try {
    const relPath = req.body.path;
    const content = req.body.content;

    if (!relPath || content === undefined) {
      return res.status(400).json({ error: 'Path and content required' });
    }

    const filePath = safeResolve(relPath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    res.json({ success: true });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// POST /api/remove-c2pa — strip C2PA/metadata from image
app.post('/api/remove-c2pa', (req, res) => {
  try {
    const relPath = req.body.path;
    if (!relPath) return res.status(400).json({ error: 'Path required' });

    const filePath = safeResolve(relPath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
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

    const success = stripC2pa(filePath, outputPath);
    if (!success) {
      return res.status(500).json({ error: 'Failed to remove metadata' });
    }

    const stat = fs.statSync(outputPath);
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

// GET /api/content?path=... — get text file content for editing
app.get('/api/content', (req, res) => {
  try {
    const relPath = req.query.path || '';
    if (!relPath) return res.status(400).json({ error: 'Path required' });

    const filePath = safeResolve(relPath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ content });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// POST /api/upload-edited — save edited image (base64)
app.post('/api/upload-edited', (req, res) => {
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

    // Ensure directory exists
    fs.mkdirSync(dir, { recursive: true });

    // Handle overwrites
    let finalName = newName;
    let finalPath = outputPath;
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      finalName = `${base}_edited(${counter})${ext}`;
      finalPath = path.join(dir, finalName);
      counter++;
    }

    fs.writeFileSync(finalPath, buffer);

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

// ─── Serve files (for download/preview) ──────────────
app.get('/files/*', (req, res) => {
  let filePath;
  try {
    const relPath = req.params[0] || '';
    filePath = safeResolve(relPath);
  } catch (err) {
    return res.status(err.statusCode || 403).send(err.message);
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Not found');
  }

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    return res.redirect('/?path=' + encodeURIComponent(relPath));
  }

  // Force audio/video files to download instead of playing inline
  const ext = path.extname(filePath).toLowerCase();
  const audioExts = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.opus'];
  const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
  const isAudio = audioExts.includes(ext);
  const isVideo = videoExts.includes(ext);

  if (isAudio || isVideo) {
    res.download(filePath);
  } else {
    res.sendFile(filePath);
  }
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
app.listen(PORT, '0.0.0.0', () => {
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
