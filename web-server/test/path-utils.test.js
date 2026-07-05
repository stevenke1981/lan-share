const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { PathTraversalError, resolveSafePath, resolveRealSafePath, resolveRealSafeParent } = require('../lib/path-utils');

const shareDir = path.resolve('/tmp/lan-share-test');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lan-share-path-'));

describe('resolveSafePath', () => {
  it('resolves empty path to share root', () => {
    assert.equal(resolveSafePath(shareDir, ''), shareDir);
    assert.equal(resolveSafePath(shareDir), shareDir);
  });

  it('resolves nested child paths', () => {
    const resolved = resolveSafePath(shareDir, 'Documents/a.txt');
    assert.equal(resolved, path.resolve(shareDir, 'Documents/a.txt'));
  });

  it('blocks parent traversal', () => {
    assert.throws(
      () => resolveSafePath(shareDir, '../etc/passwd'),
      PathTraversalError,
    );
  });

  it('blocks mixed traversal sequences', () => {
    assert.throws(
      () => resolveSafePath(shareDir, 'foo/../../outside'),
      PathTraversalError,
    );
  });

  it('allows in-directory backtracking', () => {
    const resolved = resolveSafePath(shareDir, 'subdir/../subdir/file.txt');
    assert.equal(resolved, path.resolve(shareDir, 'subdir/file.txt'));
  });
});

describe('resolveRealSafePath', () => {
  const insideDir = path.join(tmpDir, 'inside');
  const outsideDir = path.join(tmpDir, 'outside');
  const escapeLink = path.join(insideDir, 'escape');

  before(() => {
    // Setup: inside/ and outside/ dirs, then an escape symlink inside insideDir
    fs.mkdirSync(insideDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.writeFileSync(path.join(insideDir, 'safe.txt'), 'safe');
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'secret');
    // Symlink inside insideDir pointing to outsideDir
    fs.symlinkSync(outsideDir, escapeLink);
  });

  it('resolves normal paths inside share', () => {
    const result = resolveRealSafePath(insideDir, 'safe.txt');
    assert.equal(result, path.resolve(insideDir, 'safe.txt'));
  });

  it('blocks symlink escape from share', () => {
    // escapeLink is inside insideDir but points to outsideDir
    assert.throws(
      () => resolveRealSafePath(insideDir, 'escape/secret.txt'),
      PathTraversalError,
    );
  });

  it('blocks direct parent traversal via realpath', () => {
    assert.throws(
      () => resolveRealSafePath(insideDir, '../outside/secret.txt'),
      PathTraversalError,
    );
  });

  it('allows symlink inside share', () => {
    // Symlink inside the share dir pointing to another inside path
    const innerLink = path.join(insideDir, 'inner-link');
    try {
      fs.symlinkSync(insideDir, innerLink);
      const result = resolveRealSafePath(insideDir, 'inner-link/safe.txt');
      assert.equal(result, path.resolve(insideDir, 'safe.txt'));
    } finally {
      try { fs.unlinkSync(innerLink); } catch {}
    }
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('resolveRealSafeParent', () => {
  const insideDir = path.join(tmpDir, 'parent-test');
  const outsideDir = path.join(tmpDir, 'outside-parent');

  before(() => {
    fs.mkdirSync(insideDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
    // This test uses a different approach — create the link inside the test
  });

  it('resolves for new path inside share', () => {
    const result = resolveRealSafeParent(insideDir, 'new-folder');
    assert.equal(result, path.resolve(insideDir, 'new-folder'));
  });

  it('blocks when ancestor escapes via symlink', () => {
    const escapeLink = path.join(insideDir, 'escape');
    fs.symlinkSync(outsideDir, escapeLink);
    try {
      assert.throws(
        () => resolveRealSafeParent(insideDir, 'escape/evil.txt'),
        PathTraversalError,
      );
    } finally {
      fs.unlinkSync(escapeLink);
    }
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
