/**
 * Shared utilities for Speed-Doctor optimization scripts.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Parse --dir flag from process.argv, defaulting to cwd.
 */
function getProjectRoot() {
  const dirIndex = process.argv.indexOf('--dir');
  if (dirIndex !== -1 && process.argv[dirIndex + 1]) {
    return path.resolve(process.argv[dirIndex + 1]);
  }
  return process.cwd();
}

/**
 * Recursively walk a directory, yielding all file paths.
 * @param {string} dir
 * @param {string[]} [result]
 * @returns {string[]}
 */
function walkDir(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, .git, dist, build
      if (['node_modules', '.git', 'dist', 'build', '.next', 'out'].includes(entry.name)) continue;
      walkDir(fullPath, result);
    } else {
      result.push(fullPath);
    }
  }
  return result;
}

/**
 * Read file content safely; return null if not readable.
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
 * Write file content safely, creating parent dirs as needed.
 * @param {string} filePath
 * @param {string} content
 */
function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Pretty-print a section header.
 * @param {string} title
 */
function printHeader(title) {
  const line = '─'.repeat(title.length + 4);
  console.log(`\n┌${line}┐`);
  console.log(`│  ${title}  │`);
  console.log(`└${line}┘\n`);
}

/**
 * Log a success message.
 * @param {string} msg
 */
function logSuccess(msg) {
  console.log(`  ✔  ${msg}`);
}

/**
 * Log an info message.
 * @param {string} msg
 */
function logInfo(msg) {
  console.log(`  ℹ  ${msg}`);
}

/**
 * Log a warning message.
 * @param {string} msg
 */
function logWarn(msg) {
  console.warn(`  ⚠  ${msg}`);
}

/**
 * Log a skip message.
 * @param {string} msg
 */
function logSkip(msg) {
  console.log(`  ─  ${msg}`);
}

module.exports = {
  getProjectRoot,
  walkDir,
  readFile,
  writeFile,
  printHeader,
  logSuccess,
  logInfo,
  logWarn,
  logSkip,
};
