/**
 * Strip C2PA / metadata from images
 *
 * Supports:
 *   - JPEG: strips APP1 (EXIF) and APP2 markers including C2PA
 *   - PNG:  strips all ancillary chunks (keeps only critical: IHDR, PLTE, IDAT, IEND)
 */

const fs = require('fs');
const path = require('path');

/**
 * Strip metadata from an image file.
 * @param {string} inputPath  - Source file path
 * @param {string} outputPath - Output file path (will be created)
 * @returns {boolean} true on success
 */
function stripC2pa(inputPath, outputPath) {
  const ext = path.extname(inputPath).toLowerCase();

  try {
    if (ext === '.jpg' || ext === '.jpeg') {
      return stripJpeg(inputPath, outputPath);
    }
    if (ext === '.png') {
      return stripPng(inputPath, outputPath);
    }
    // Unsupported format — copy as-is
    fs.copyFileSync(inputPath, outputPath);
    return true;
  } catch (e) {
    console.error('stripC2pa error:', e.message);
    return false;
  }
}

// ─── JPEG Stripper ────────────────────────────────────
//
// JPEG structure: SOI (FFD8) | APP0 (FFE0) | APP1 (FFE1) | ... | SOF | SOS | EOI
// We keep: SOI, APP0 (JFIF), SOF, DHT, DQT, COM, SOS, EOI
// We strip: APP1 (EXIF/C2PA), APP2 (C2PA/MPF), APP13 (Photoshop), APP14 (Adobe)

function stripJpeg(inputPath, outputPath) {
  const data = fs.readFileSync(inputPath);
  const out = [];
  let i = 0;

  if (data[i] !== 0xFF || data[i + 1] !== 0xD8) {
    // Not a valid JPEG
    return false;
  }

  out.push(0xFF, 0xD8); // SOI
  i = 2;

  while (i < data.length) {
    if (data[i] !== 0xFF) {
      // Shouldn't happen in valid JPEG
      break;
    }

    const marker = data[i + 1];

    // SOS (Start of Scan) — image data follows, copy rest as-is
    if (marker === 0xDA) {
      // Copy SOS marker + everything after
      out.push(data[i], data[i + 1]);
      i += 2;
      // Scan data has no length prefix, copy to EOI
      while (i < data.length) {
        out.push(data[i]);
        i++;
      }
      break;
    }

    // EOI (End of Image)
    if (marker === 0xD9) {
      out.push(data[i], data[i + 1]);
      break;
    }

    // Markers to strip (metadata we don't want)
    const stripMarkers = new Set([
      0xE1, // APP1  — EXIF, XMP, C2PA
      0xE2, // APP2  — C2PA, FlashPix, MPF
      0xED, // APP13 — Photoshop IRB
      0xEE, // APP14 — Adobe
      0xFE, // COM   — Comment (optional, keep EXIF cleaner)
    ]);

    // For markers with segment data, read length
    if (marker >= 0xE0 && marker <= 0xFE && marker !== 0xE0) {
      const segLen = (data[i + 2] << 8) + data[i + 3] + 2;
      if (!stripMarkers.has(marker)) {
        out.push(data[i], data[i + 1]);
        for (let j = 0; j < segLen; j++) {
          out.push(data[i + 2 + j]);
        }
      }
      i += 2 + segLen;
    } else if (marker >= 0xD0 && marker <= 0xD7) {
      // RST markers (no data)
      out.push(data[i], data[i + 1]);
      i += 2;
    } else if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xD0 && marker !== 0xD4 && marker !== 0xD8 && marker !== 0xD9 && marker !== 0xDA) {
      // SOF, DHT, DQT, etc. — keep these
      const segLen = (data[i + 2] << 8) + data[i + 3] + 2;
      out.push(data[i], data[i + 1]);
      for (let j = 0; j < segLen; j++) {
        out.push(data[i + 2 + j]);
      }
      i += 2 + segLen;
    } else if (marker === 0xE0) {
      // APP0 (JFIF) — keep
      const segLen = (data[i + 2] << 8) + data[i + 3] + 2;
      out.push(data[i], data[i + 1]);
      for (let j = 0; j < segLen; j++) {
        out.push(data[i + 2 + j]);
      }
      i += 2 + segLen;
    } else {
      // Unknown marker, skip
      i += 2;
    }
  }

  fs.writeFileSync(outputPath, Buffer.from(out));
  return true;
}

// ─── PNG Stripper ─────────────────────────────────────
//
// PNG structure: signature | IHDR | ... | IDAT | IEND
// Critical chunks: IHDR, PLTE, IDAT, IEND
// Ancillary chunks: all others (bKGD, cHRM, eXIf, gAMA, hIST, iCCP, iTXt,
//                    oFFs, pCAL, pHYs, sBIT, sPLT, sRGB, sTER, tEXt,
//                    tIME, tRNS, zTXt, c2pa, etc.)
// We strip all ancillary chunks except tRNS (transparency)

function stripPng(inputPath, outputPath) {
  const data = fs.readFileSync(inputPath);
  const signature = data.slice(0, 8);
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  if (!signature.equals(pngSignature)) {
    return false;
  }

  const out = [signature];
  let i = 8;

  while (i < data.length) {
    const length = data.readUInt32BE(i);
    const type = data.toString('ascii', i + 4, i + 8);

    // Critical chunks to keep
    const keep = type === 'IHDR' || type === 'PLTE' || type === 'IDAT' || type === 'IEND';

    // tRNS (transparency) is ancillary but useful
    const keepAncillary = type === 'tRNS';

    if (keep || keepAncillary) {
      out.push(data.slice(i, i + 12 + length)); // length + type + data + CRC
    }
    // else: strip this ancillary chunk

    i += 12 + length;
  }

  fs.writeFileSync(outputPath, Buffer.concat(out));
  return true;
}

module.exports = { stripC2pa };
