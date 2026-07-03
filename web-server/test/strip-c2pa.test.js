const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { stripC2pa } = require('../strip-c2pa');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lan-share-strip-'));

function writeTemp(name, buffer) {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

// Minimal valid JPEG: SOI + EOI
const MIN_JPEG = Buffer.from([0xFF, 0xD8, 0xFF, 0xD9]);
// Minimal valid PNG: signature + IHDR + IDAT + IEND chunks
const MIN_PNG = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.from([
    0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0,
    0x90, 0x77, 0x53, 0xDE,
    0, 0, 0, 0, 73, 68, 65, 84, 8, 29, 1, 0, 0, 255, 255, 0, 0, 0, 2, 0, 1,
    0xE2, 0x21, 0xBC, 0x33,
    0, 0, 0, 0, 73, 69, 78, 68, 0xAE, 0x42, 0x60, 0x82,
  ]),
]);

describe('stripC2pa', () => {
  it('processes minimal JPEG buffers', () => {
    const input = writeTemp('test.jpg', MIN_JPEG);
    const output = path.join(tmpDir, 'test-clean.jpg');
    assert.equal(stripC2pa(input, output), true);
    assert.equal(fs.existsSync(output), true);
  });

  it('processes minimal PNG buffers', () => {
    const input = writeTemp('test.png', MIN_PNG);
    const output = path.join(tmpDir, 'test-clean.png');
    assert.equal(stripC2pa(input, output), true);
    assert.equal(fs.existsSync(output), true);
  });

  it('copies unsupported formats as-is', () => {
    const input = writeTemp('notes.txt', Buffer.from('hello'));
    const output = path.join(tmpDir, 'notes-copy.txt');
    assert.equal(stripC2pa(input, output), true);
    assert.equal(fs.readFileSync(output, 'utf-8'), 'hello');
  });
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});