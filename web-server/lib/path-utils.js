const path = require('path');

class PathTraversalError extends Error {
  constructor(message = 'Access denied') {
    super(message);
    this.name = 'PathTraversalError';
    this.statusCode = 403;
  }
}

/**
 * Resolve a user-supplied relative path and ensure it stays within shareDir.
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

module.exports = { PathTraversalError, resolveSafePath };