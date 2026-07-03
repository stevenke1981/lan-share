/**
 * Auto-categorize files by type into corresponding directories
 *
 * Maps to existing structure: Documents/, Videos/, Pictures/, Music/, Downloads/
 */

const path = require('path');

const IMAGE_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.bmp', '.svg', '.tiff', '.tif', '.avif', '.ico', '.heic', '.heif',
]);

const VIDEO_EXTS = new Set([
  '.mp4', '.webm', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.m4v',
]);

const AUDIO_EXTS = new Set([
  '.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a', '.opus',
]);

const DOCUMENT_EXTS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.md', '.markdown', '.csv', '.html', '.htm', '.rtf', '.odt', '.ods',
  '.json', '.xml', '.yaml', '.yml', '.toml', '.log', '.ini', '.cfg', '.conf',
  '.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.php', '.java', '.c', '.cpp', '.h',
  '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd', '.sql', '.tex', '.rst',
]);

const ARCHIVE_EXTS = new Set([
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.zst',
]);

/**
 * Categorize a file based on its extension
 * @param {string} filename - Original filename
 * @returns {string} Category name matching one of the share directories
 */
function categorize(filename) {
  const ext = path.extname(filename).toLowerCase();

  if (IMAGE_EXTS.has(ext)) return 'Pictures';
  if (VIDEO_EXTS.has(ext)) return 'Videos';
  if (AUDIO_EXTS.has(ext)) return 'Music';
  if (DOCUMENT_EXTS.has(ext)) return 'Documents';
  if (ARCHIVE_EXTS.has(ext)) return 'Downloads';

  // Code files without common extensions
  const basename = path.basename(filename).toLowerCase();
  if (basename === 'dockerfile' || basename === 'makefile' ||
      basename.endsWith('.env') || basename === '.gitignore') {
    return 'Projects';
  }

  return 'Downloads'; // Default for uncategorized
}

/**
 * Normalize Chinese filenames (fixes macOS decomposed Unicode & browser encoding issues)
 * @param {string} originalName - Raw filename from upload
 * @returns {string} Normalized filename
 */
function normalizeFilename(originalName) {
  try {
    // Step 1: NFC normalization (fixes macOS decomposed Unicode like 檔案→檔+案)
    let name = originalName.normalize('NFC');

    // Step 2: Latin-1 → UTF-8 fix (some browsers double-encode Chinese characters)
    if ([...name].some(c => c.charCodeAt(0) > 127)) {
      const asLatin1 = Buffer.from(name, 'latin1').toString('utf-8');
      // Only use if conversion produced more valid Chinese characters
      if (!asLatin1.includes('\uFFFD') && asLatin1 !== name) {
        const chineseCount = (s) => [...s].filter(c => c > '\u4e00' && c < '\u9fff').length;
        if (chineseCount(asLatin1) > chineseCount(name)) {
          name = asLatin1;
        }
      }
    }

    return name;
  } catch {
    return originalName;
  }
}

module.exports = { categorize, normalizeFilename };
