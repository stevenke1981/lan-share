const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { categorize, normalizeFilename } = require('../categorize');

describe('categorize', () => {
  it('classifies images', () => {
    assert.equal(categorize('photo.jpg'), 'Pictures');
    assert.equal(categorize('icon.PNG'), 'Pictures');
  });

  it('classifies videos', () => {
    assert.equal(categorize('clip.mp4'), 'Videos');
  });

  it('classifies audio', () => {
    assert.equal(categorize('song.mp3'), 'Music');
  });

  it('classifies documents', () => {
    assert.equal(categorize('readme.md'), 'Documents');
  });

  it('classifies archives', () => {
    assert.equal(categorize('backup.zip'), 'Downloads');
  });

  it('classifies project files', () => {
    assert.equal(categorize('Dockerfile'), 'Projects');
  });

  it('defaults unknown extensions to Downloads', () => {
    assert.equal(categorize('unknown.xyz'), 'Downloads');
  });
});

describe('normalizeFilename', () => {
  it('applies NFC normalization', () => {
    const composed = 'café.txt';
    const decomposed = composed.normalize('NFD');
    assert.notEqual(decomposed, composed);
    assert.equal(normalizeFilename(decomposed), composed);
  });

  it('returns original name on invalid input', () => {
    assert.equal(normalizeFilename('plain.txt'), 'plain.txt');
  });
});