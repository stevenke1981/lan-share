const path = require('path');
const fs = require('fs');

class PathTraversalError extends Error {
  constructor(message = 'Access denied') {
    super(message);
    this.name = 'PathTraversalError';
    this.statusCode = 403;
  }
}

/**
 * Resolve a user-supplied relative path and ensure it stays within shareDir.
 * Uses string-level path resolution (no realpath). Fast, but does not guard
 * against symlink escape attacks.
 *
 * @param {string} shareDir - Absolute share root directory
 * @param {string} [relativePath] - User-provided relative path
 * @returns {string} Resolved absolute path
 */
function resolveSafePath(shareDir, relativePath = '') {
  const base = path.resolve(shareDir);
  const target = path.resolve(base, relativePath || '.');

  if (target === base) {
    return base;
  }

  const prefix = base.endsWith(path.sep) ? base : base + path.sep;
  if (!target.startsWith(prefix)) {
    throw new PathTraversalError();
  }

  return target;
}

/**
 * Like resolveSafePath but additionally validates the path against symlink
 * escape: after string-level validation, resolves the real filesystem path
 * and verifies it still resides within the real share directory.
 *
 * For paths that don't exist yet (new files/dirs), validates the nearest
 * existing ancestor directory.
 *
 * @param {string} shareDir - Absolute share root directory
 * @param {string} relativePath - User-provided relative path
 * @returns {string} Resolved absolute path (real)
 */
function resolveRealSafePath(shareDir, relativePath) {
  // First: string-level validation (block ../ etc.)
  const resolved = resolveSafePath(shareDir, relativePath);

  // Resolve realpath of the share dir (handles share dir itself being a symlink)
  const realShare = fs.realpathSync(shareDir);
  const realResolved = fs.realpathSync(resolved);

  // resolved may have been symlinked outside share — check realpath
  const prefix = realShare.endsWith(path.sep) ? realShare : realShare + path.sep;
  if (realResolved !== realShare && !realResolved.startsWith(prefix)) {
    throw new PathTraversalError('Access denied: symlink escape detected');
  }

  return realResolved;
}

/**
 * Resolve the real directory path of the nearest existing ancestor.
 * Use this for paths that don't exist yet (creations, renames).
 *
 * @param {string} shareDir - Absolute share root directory
 * @param {string} relativePath - User-provided relative path
 * @returns {{ resolved: string, realAncestor: string }}
 */
function resolveRealSafeParent(shareDir, relativePath) {
  const resolved = resolveSafePath(shareDir, relativePath);
  const realShare = fs.realpathSync(shareDir);

  // Walk up from resolved until we find an existing path
  let candidate = resolved;
  while (!fs.existsSync(candidate)) {
    const parent = path.dirname(candidate);
    if (parent === candidate) break; // root
    candidate = parent;
  }

  const realCandidate = fs.realpathSync(candidate);
  const prefix = realShare.endsWith(path.sep) ? realShare : realShare + path.sep;
  if (realCandidate !== realShare && !realCandidate.startsWith(prefix)) {
    throw new PathTraversalError('Access denied: symlink escape detected');
  }

  return resolved;
}

module.exports = { PathTraversalError, resolveSafePath, resolveRealSafePath, resolveRealSafeParent };
