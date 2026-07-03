const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { PathTraversalError, resolveSafePath } = require('../lib/path-utils');

const shareDir = path.resolve('/tmp/lan-share-test');

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