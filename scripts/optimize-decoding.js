#!/usr/bin/env node
/**
 * optimize-decoding.js
 *
 * Adds decoding="async" to below-fold <img> tags so the browser decodes them
 * off the main thread, reducing jank and frame drops during scroll.
 *
 * Above-fold images are skipped — decoding="async" can delay LCP on hero images.
 * Images already carrying decoding="async"|"sync"|"auto" are skipped (idempotent).
 *
 * Usage:
 *   node scripts/optimize-decoding.js [--dir /path/to/project]
 *   npm run optimize:decoding
 *
 * What changes:
 *   <img loading="lazy" src="..." />
 *   → <img loading="lazy" decoding="async" src="..." />
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  getProjectRoot, walkDir, readFile, writeFile,
  printHeader, logSuccess, logInfo, logSkip, logWarn,
} = require('./utils');

const SOURCE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.html', '.vue', '.svelte']);

// Keywords that indicate above-fold — skip these (don't add async decoding)
const ABOVE_FOLD_NAMES = ['hero', 'banner', 'cover', 'header', 'landing', 'splash', 'intro', 'jumbotron'];

function isAboveFoldFile(filePath) {
  const lower = filePath.toLowerCase();
  return ABOVE_FOLD_NAMES.some(kw => lower.includes(kw));
}

function getContext(content, index, windowSize = 300) {
  return content.slice(Math.max(0, index - windowSize), Math.min(content.length, index + windowSize));
}

function isAboveFoldContext(ctx) {
  const lower = ctx.toLowerCase();
  return ABOVE_FOLD_NAMES.some(kw => lower.includes(kw));
}

/**
 * Process a source file — adds decoding="async" to lazy-loaded <img> tags
 * that don't already have a decoding attribute.
 */
function processFile(filePath, content) {
  const isAboveFold = isAboveFoldFile(filePath);
  let updated = content;
  let fixes = 0;

  // Match <img> tags that have loading="lazy" but no decoding attribute
  const lazyImgRe = /<img\s[^>]*loading=["']lazy["'][^>]*\/?>/gi;

  updated = updated.replace(lazyImgRe, (tag, offset) => {
    // Skip if already has a decoding attribute
    if (/\bdecoding\s*=/.test(tag)) return tag;
    // Skip if above-fold by filename or surrounding code
    if (isAboveFold || isAboveFoldContext(getContext(content, offset))) return tag;

    // Inject decoding="async" after loading="lazy"
    const fixed = tag.replace(/loading=["']lazy["']/i, 'loading="lazy" decoding="async"');
    fixes++;
    return fixed;
  });

  return { updated, fixes, changed: updated !== content };
}

async function main() {
  printHeader('Speed-Doctor: Image Decoding Optimization');

  const projectRoot = getProjectRoot();
  logInfo(`Project root: ${projectRoot}`);

  const srcDirs = ['src', 'app', 'pages', 'components'].map(d => path.join(projectRoot, d));
  const sourceFiles = [];

  const indexHtml = path.join(projectRoot, 'index.html');
  if (fs.existsSync(indexHtml)) sourceFiles.push(indexHtml);

  for (const dir of srcDirs) {
    if (fs.existsSync(dir)) {
      walkDir(dir)
        .filter(f => SOURCE_EXTS.has(path.extname(f).toLowerCase()))
        .forEach(f => sourceFiles.push(f));
    }
  }

  if (sourceFiles.length === 0) {
    logInfo('No source files found.');
    return;
  }

  logInfo(`Scanning ${sourceFiles.length} file(s) for lazy images missing decoding="async"...\n`);

  let totalFixed = 0;

  for (const filePath of sourceFiles) {
    const content = readFile(filePath);
    if (!content) continue;

    const { updated, fixes, changed } = processFile(filePath, content);

    if (changed) {
      writeFile(filePath, updated);
      logSuccess(`+${fixes} decoding="async"  →  ${path.relative(projectRoot, filePath)}`);
      totalFixed += fixes;
    }
  }

  console.log('');
  if (totalFixed > 0) {
    logSuccess(`Added decoding="async" to ${totalFixed} lazy image(s).`);
    logInfo('Browser will now decode these images off the main thread, reducing scroll jank.');
  } else {
    logSkip('All lazy images already have a decoding attribute, or none found.');
  }
  console.log('');
}

main().catch(err => {
  console.error('\n  ✖  Error:', err.message);
  process.exit(1);
});
