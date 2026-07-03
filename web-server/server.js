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

// ─── Configuration ────────────────────────────────────
const SHARE_DIR = path.resolve(process.argv.includes('--dir')
  ? process.argv[process.argv.indexOf('--dir') + 1]
  : process.env.SHARE_DIR || '/mnt/lan-share');
const PORT = parseInt(process.argv.includes('--port')
  ? process.argv[process.argv.indexOf('--port') + 1]
  : process.env.FB_PORT || '8080', 10);
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || (500 * 1024 * 1024).toString(), 10);

// ─── Ensure share directory exists ────────────────────
if (!fs.existsSync(SHARE_DIR)) {
  console.error(`Share directory does not exist: ${SHARE_DIR}`);
  process.exit(1);
}

const app = express();

// ─── Multer upload ────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Upload to the current directory or a subdirectory
    const uploadDir = req.body._path
      ? path.join(SHARE_DIR, path.normalize(req.body._path))
      : SHARE_DIR;
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Preserve original filename, avoid overwrites
    let name = file.originalname;
    const dest = req.body._path
      ? path.join(SHARE_DIR, path.normalize(req.body._path), name)
      : path.join(SHARE_DIR, name);
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

// GET /api/list?path=... — list directory contents
app.get('/api/list', (req, res) => {
  try {
    const relPath = req.query.path || '';
    const targetPath = path.join(SHARE_DIR, path.normalize(relPath));

    // Security: prevent directory traversal
    if (!targetPath.startsWith(SHARE_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }
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
    res.status(500).json({ error: err.message });
  }
});

// POST /api/upload — upload files
app.post('/api/upload', upload.array('files', 50), (req, res) => {
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

// POST /api/mkdir — create directory
app.post('/api/mkdir', express.json(), (req, res) => {
  try {
    const relPath = req.body.path || '';
    const dirName = req.body.name;
    if (!dirName) return res.status(400).json({ error: 'Name required' });

    const targetPath = path.join(SHARE_DIR, path.normalize(relPath), dirName);
    if (!targetPath.startsWith(SHARE_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (fs.existsSync(targetPath)) {
      return res.status(409).json({ error: 'Already exists' });
    }

    fs.mkdirSync(targetPath, { recursive: true });
    res.json({ success: true, path: getRelativePath(targetPath) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/delete — delete file or directory
app.delete('/api/delete', express.json(), (req, res) => {
  try {
    const relPath = req.body.path;
    if (!relPath) return res.status(400).json({ error: 'Path required' });

    const targetPath = path.join(SHARE_DIR, path.normalize(relPath));
    if (!targetPath.startsWith(SHARE_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    fs.rmSync(targetPath, { recursive: true, force: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// ─── Serve files (for download/preview) ──────────────
app.get('/files/*', (req, res) => {
  const relPath = req.params[0] || '';
  const filePath = path.join(SHARE_DIR, path.normalize(relPath));

  if (!filePath.startsWith(SHARE_DIR)) {
    return res.status(403).send('Access denied');
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Not found');
  }

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    return res.redirect('/?path=' + encodeURIComponent(relPath));
  }

  res.sendFile(filePath);
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
  console.log('║  No login required — home LAN use only   ║');
  console.log('╚═══════════════════════════════════════════╝');
  console.log('');
});
