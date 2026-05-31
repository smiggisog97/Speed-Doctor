'use strict';

/**
 * fileUtils.js
 *
 * General-purpose file I/O utilities used across Speed-Doctor scripts.
 */

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', '.cache', '.turbo']);

/**
 * Safely read a file's UTF-8 contents.
 * Returns null if the file doesn't exist or can't be read.
 * @param {string} filePath
 * @returns {string|null}
 */
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Write content to a file, creating parent directories as needed.
 * @param {string} filePath
 * @param {string} content
 */
function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Read a file as a Buffer (for binary data).
 * @param {string} filePath
 * @returns {Buffer|null}
 */
function readFileBinary(filePath) {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

/**
 * Write a Buffer to a file.
 * @param {string} filePath
 * @param {Buffer} buffer
 */
function writeFileBinary(filePath, buffer) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

/**
 * Recursively walk a directory, returning all file paths.
 * Skips common non-source directories.
 * @param {string} dir
 * @param {string[]} [result]
 * @returns {string[]}
 */
function walkDir(dir, result = []) {
  if (!fs.existsSync(dir)) return result;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, result);
    } else if (entry.isFile()) {
      result.push(fullPath);
    }
  }

  return result;
}

/**
 * Find files matching given extensions in a directory (recursively).
 * @param {string} dir
 * @param {string[]} extensions - e.g. ['.css', '.scss']
 * @returns {string[]}
 */
function findByExtension(dir, extensions) {
  const extSet = new Set(extensions.map(e => e.toLowerCase()));
  return walkDir(dir).filter(f => extSet.has(path.extname(f).toLowerCase()));
}

/**
 * Get file size in kilobytes.
 * @param {string} filePath
 * @returns {number}
 */
function fileSizeKb(filePath) {
  try {
    return Math.round(fs.statSync(filePath).size / 1024);
  } catch {
    return 0;
  }
}

/**
 * Check if a file is newer than another file.
 * @param {string} srcPath
 * @param {string} destPath
 * @returns {boolean} - True if dest is newer than src (i.e., up-to-date)
 */
function isNewerThan(srcPath, destPath) {
  try {
    const srcMtime = fs.statSync(srcPath).mtimeMs;
    const destMtime = fs.statSync(destPath).mtimeMs;
    return destMtime >= srcMtime;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 * @param {string} dirPath
 */
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Parse the --dir CLI argument, defaulting to process.cwd().
 * @returns {string}
 */
function getProjectRoot() {
  const dirIndex = process.argv.indexOf('--dir');
  if (dirIndex !== -1 && process.argv[dirIndex + 1]) {
    return path.resolve(process.argv[dirIndex + 1]);
  }
  return process.cwd();
}

module.exports = {
  readFile,
  writeFile,
  readFileBinary,
  writeFileBinary,
  walkDir,
  findByExtension,
  fileSizeKb,
  isNewerThan,
  ensureDir,
  getProjectRoot,
};
