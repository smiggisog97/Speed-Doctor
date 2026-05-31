#!/usr/bin/env node
/**
 * optimize-lazy.js
 *
 * Audits images using loading="lazy" that are actually above-the-fold or in carousels,
 * and replaces them with loading="eager" + fetchpriority="high".
 *
 * Usage:
 *   node scripts/optimize-lazy.js [--dir /path/to/project]
 *   npm run optimize:lazy
 *
 * Options:
 *   --dir   Project root directory (defaults to cwd)
 *
 * Heuristics:
 *   - Hero, banner, header, landing, first-section component → eager
 *   - Carousel, slider, swiper components → eager (visible in first frame)
 *   - Components with 'lazy' in the name but 'hero'/'banner' in the usage → eager
 *
 * Idempotent: won't double-modify files already updated.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getProjectRoot, walkDir, readFile, writeFile, printHeader, logSuccess, logInfo, logSkip, logWarn } = require('./utils');

const SOURCE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.html', '.vue', '.svelte']);

// Above-fold component name keywords
const ABOVE_FOLD_NAMES = ['hero', 'banner', 'cover', 'header', 'landing', 'firstsection', 'first-section', 'above-fold', 'intro', 'splash', 'jumbotron'];

// Carousel/slider keywords (these images are visible immediately)
const CAROUSEL_NAMES = ['carousel', 'slider', 'swiper', 'slideshow', 'gallery-hero', 'featured'];

/**
 * Check if a file path suggests above-fold or carousel context.
 */
function isAboveFoldFile(filePath) {
  const lower = filePath.toLowerCase();
  return (
    ABOVE_FOLD_NAMES.some(kw => lower.includes(kw)) ||
    CAROUSEL_NAMES.some(kw => lower.includes(kw))
  );
}

/**
 * Check if surrounding code context suggests above-fold.
 */
function isAboveFoldContext(surroundingCode) {
  if (!surroundingCode) return false;
  const lower = surroundingCode.toLowerCase();
  return (
    ABOVE_FOLD_NAMES.some(kw => lower.includes(kw)) ||
    CAROUSEL_NAMES.some(kw => lower.includes(kw))
  );
}

/**
 * Extract a window of code around a match position for context analysis.
 */
function getContext(content, index, windowSize = 300) {
  const start = Math.max(0, index - windowSize);
  const end = Math.min(content.length, index + windowSize);
  return content.slice(start, end);
}

/**
 * Process a JSX/HTML file and fix lazy loading on above-fold images.
 * Returns { updated: boolean, fixes: number, content: string }
 */
function processSourceFile(filePath, content) {
  const isAboveFold = isAboveFoldFile(filePath);
  let updated = content;
  let fixes = 0;

  // Pattern 1: <img ... loading="lazy" ... />  (JSX/HTML)
  // We need to handle attributes in any order
  const imgTagRe = /<img\s[^>]*loading=["']lazy["'][^>]*\/?>/gi;

  updated = updated.replace(imgTagRe, (imgTag, offset) => {
    const context = getContext(content, offset);
    const shouldFix = isAboveFold || isAboveFoldContext(context);

    if (!shouldFix) return imgTag; // keep lazy for below-fold

    let fixed = imgTag;

    // Replace loading="lazy" with loading="eager"
    fixed = fixed.replace(/loading=["']lazy["']/i, 'loading="eager"');

    // Add fetchpriority="high" if not already present
    if (!fixed.includes('fetchpriority') && !fixed.includes('fetchPriority')) {
      // Insert after loading="eager"
      fixed = fixed.replace(/loading=["']eager["']/i, 'loading="eager" fetchpriority="high"');
    }

    fixes++;
    return fixed;
  });

  // Pattern 2: JSX with loading={'lazy'} or loading={`lazy`}
  const jsxLazyRe = /<img\s[^>]*loading=\{[`'"]lazy[`'"]\}[^>]*\/?>/gi;

  updated = updated.replace(jsxLazyRe, (imgTag, offset) => {
    const context = getContext(content, offset);
    const shouldFix = isAboveFold || isAboveFoldContext(context);

    if (!shouldFix) return imgTag;

    let fixed = imgTag;
    fixed = fixed.replace(/loading=\{[`'"]lazy[`'"]\}/i, 'loading="eager"');
    if (!fixed.includes('fetchpriority') && !fixed.includes('fetchPriority')) {
      fixed = fixed.replace(/loading=["']eager["']/i, 'loading="eager" fetchpriority="high"');
    }
    fixes++;
    return fixed;
  });

  return { updated, fixes, changed: updated !== content };
}

/**
 * Audit a file and report all lazy images without fixing.
 */
function auditFile(filePath, content) {
  const issues = [];
  const imgTagRe = /<img\s[^>]*loading=["']lazy["'][^>]*/gi;
  let m;

  while ((m = imgTagRe.exec(content)) !== null) {
    const context = getContext(content, m.index);
    const aboveFold = isAboveFoldFile(filePath) || isAboveFoldContext(context);

    // Extract src for reporting
    const srcMatch = /src=["']([^'"]+)["']/.exec(m[0]);
    const src = srcMatch ? srcMatch[1] : '(unknown src)';

    issues.push({
      src,
      aboveFold,
      line: content.slice(0, m.index).split('\n').length,
    });
  }

  return issues;
}

async function main() {
  printHeader('Speed-Doctor: Lazy Loading Audit & Fix');

  const projectRoot = getProjectRoot();
  logInfo(`Project root: ${projectRoot}`);

  // Find source files
  const srcDirs = ['src', 'app', 'pages', 'components'].map(d => path.join(projectRoot, d));
  const sourceFiles = [];

  // Include index.html
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
    logInfo('No source files found to audit.');
    return;
  }

  logInfo(`Scanning ${sourceFiles.length} file(s) for lazy-loaded images...\n`);

  let totalIssues = 0;
  let totalFixed = 0;
  let totalAudited = 0;

  for (const filePath of sourceFiles) {
    const content = readFile(filePath);
    if (!content) continue;

    // First audit
    const issues = auditFile(filePath, content);
    if (issues.length === 0) continue;

    totalAudited += issues.length;
    const aboveFoldIssues = issues.filter(i => i.aboveFold);

    if (aboveFoldIssues.length > 0) {
      logWarn(`${path.relative(projectRoot, filePath)}: ${aboveFoldIssues.length} above-fold lazy image(s) found`);
      for (const issue of aboveFoldIssues) {
        logInfo(`    Line ${issue.line}: ${issue.src}`);
      }
    } else {
      logSkip(`${path.relative(projectRoot, filePath)}: ${issues.length} lazy image(s) (below-fold, kept)`);
      continue;
    }

    // Fix above-fold lazy images
    const { updated, fixes, changed } = processSourceFile(filePath, content);

    if (changed) {
      writeFile(filePath, updated);
      logSuccess(`Fixed ${fixes} lazy → eager in: ${path.relative(projectRoot, filePath)}`);
      totalFixed += fixes;
      totalIssues += aboveFoldIssues.length;
    }
  }

  console.log('');
  logInfo(`Audit complete. Found ${totalAudited} lazy image(s) total.`);
  if (totalFixed > 0) {
    logSuccess(`Fixed ${totalFixed} above-fold lazy image(s) → loading="eager" fetchpriority="high"`);
  } else if (totalIssues === 0 && totalAudited === 0) {
    logInfo('No lazy-loaded images found in source files.');
  } else {
    logInfo('No above-fold lazy images found. All lazy images appear to be below-fold (correct).');
  }

  console.log('');
  logInfo('Tip: Manually verify the fixes by checking your page in Chrome DevTools → Network → Img filters.');
}

main().catch(err => {
  console.error('\n  ✖  Error:', err.message);
  process.exit(1);
});
