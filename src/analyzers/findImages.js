'use strict';

/**
 * findImages.js
 *
 * Recursively finds all image files in a project.
 * Searches public/, assets/, src/assets/, and the project root.
 */

const fs = require('fs');
const path = require('path');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', '.cache']);

/**
 * Walk a directory recursively, yielding all files.
 * @param {string} dir
 * @returns {string[]}
 */
function walkDir(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath).forEach(f => results.push(f));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Find all images in the given project root.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @param {object} [options]
 * @param {boolean} [options.includeWebp=true] - Include .webp files
 * @param {boolean} [options.includeSvg=false] - Include .svg files
 * @returns {{ path: string, ext: string, sizeKb: number }[]}
 */
function findImages(projectRoot, options = {}) {
  const { includeWebp = true, includeSvg = false } = options;

  const searchDirs = [
    path.join(projectRoot, 'public'),
    path.join(projectRoot, 'assets'),
    path.join(projectRoot, 'src', 'assets'),
    path.join(projectRoot, 'static'),
  ];

  const seen = new Set();
  const images = [];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;

    walkDir(dir).forEach(filePath => {
      if (seen.has(filePath)) return;
      seen.add(filePath);

      const ext = path.extname(filePath).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) return;
      if (!includeWebp && ext === '.webp') return;
      if (!includeSvg && ext === '.svg') return;

      let sizeKb = 0;
      try {
        sizeKb = Math.round(fs.statSync(filePath).size / 1024);
      } catch { /* ignore */ }

      images.push({ path: filePath, ext, sizeKb });
    });
  }

  return images;
}

/**
 * Find images that have not yet been converted to WebP.
 * @param {string} projectRoot
 * @returns {{ path: string, ext: string, sizeKb: number }[]}
 */
function findUnconvertedImages(projectRoot) {
  const all = findImages(projectRoot, { includeWebp: false });

  return all.filter(img => {
    const webpPath = img.path.replace(/\.(png|jpg|jpeg)$/i, '.webp');
    return !fs.existsSync(webpPath);
  });
}

module.exports = { findImages, findUnconvertedImages, walkDir };
