'use strict';

/**
 * encodeUtils.js
 *
 * URL encoding helpers for asset paths.
 * Handles the tricky case of paths with spaces, special characters,
 * and already-encoded sequences.
 */

/**
 * Encode a URL path segment, preserving slashes and not double-encoding.
 *
 * Examples:
 *   '/Life Outside Pixels.webp' → '/Life%20Outside%20Pixels.webp'
 *   '/already%20encoded.webp' → '/already%20encoded.webp' (unchanged)
 *   '/normal-path.webp' → '/normal-path.webp' (unchanged)
 *
 * @param {string} urlPath
 * @returns {string}
 */
function encodeAssetPath(urlPath) {
  if (!urlPath) return urlPath;

  return urlPath
    .split('/')
    .map(segment => {
      if (!segment) return segment; // preserve leading/trailing slashes

      // Don't double-encode existing percent sequences
      if (/%[0-9A-Fa-f]{2}/.test(segment)) return segment;

      // Only encode if there are characters that need encoding
      // (spaces, brackets, #, etc.)
      if (/[ #?&+%]/.test(segment)) {
        return encodeURIComponent(segment)
          .replace(/%2F/g, '/') // re-decode slashes
          .replace(/%2E/g, '.') // keep dots readable
          .replace(/%2D/g, '-') // keep hyphens readable
          .replace(/%5F/g, '_'); // keep underscores readable
      }

      return segment;
    })
    .join('/');
}

/**
 * Decode an encoded URL path back to a human-readable string.
 * @param {string} encodedPath
 * @returns {string}
 */
function decodeAssetPath(encodedPath) {
  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
}

/**
 * Normalize a path for use as an HTML attribute value.
 * Ensures leading slash, forward slashes, and proper encoding.
 *
 * @param {string} filePath - Could be absolute, relative, or public-root-relative
 * @param {string} [projectRoot] - If provided, used to make path public-root-relative
 * @returns {string}
 */
function normalizePublicPath(filePath, projectRoot) {
  let normalized = filePath.replace(/\\/g, '/'); // Windows → Unix slashes

  if (projectRoot) {
    const publicDir = (projectRoot + '/public').replace(/\\/g, '/');
    if (normalized.startsWith(publicDir)) {
      normalized = normalized.slice(publicDir.length);
    }
  }

  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }

  return encodeAssetPath(normalized);
}

/**
 * Check if a path contains characters that need URL encoding.
 * @param {string} urlPath
 * @returns {boolean}
 */
function needsEncoding(urlPath) {
  return /[ #?&+%<>"{}|\\^`]/.test(urlPath);
}

/**
 * Build a CSS url() value with proper encoding.
 * @param {string} path
 * @returns {string}
 */
function buildCssUrl(path) {
  const encoded = encodeAssetPath(path);
  // Use single quotes for CSS url() to avoid escaping issues
  return `url('${encoded}')`;
}

module.exports = {
  encodeAssetPath,
  decodeAssetPath,
  normalizePublicPath,
  needsEncoding,
  buildCssUrl,
};
