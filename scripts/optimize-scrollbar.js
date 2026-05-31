#!/usr/bin/env node
/**
 * optimize-scrollbar.js
 *
 * Prevents Cumulative Layout Shift (CLS) caused by scrollbar appearance/disappearance
 * by adding:
 *   html { overflow-y: scroll; scrollbar-gutter: stable; }
 *
 * Targets:
 *   - Global CSS files (index.css, globals.css, app.css, main.css, base.css, reset.css)
 *   - Or any CSS file that already targets the html element
 *
 * Usage:
 *   node scripts/optimize-scrollbar.js [--dir /path/to/project]
 *   npm run optimize:scrollbar
 *
 * Options:
 *   --dir   Project root directory (defaults to cwd)
 *
 * Idempotent: skips files where the rule already exists.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getProjectRoot, walkDir, readFile, writeFile, printHeader, logSuccess, logInfo, logSkip, logWarn } = require('./utils');

const CSS_EXTENSIONS = new Set(['.css', '.scss', '.sass']);

// Names of global/entry CSS files (priority order)
const GLOBAL_CSS_NAMES = [
  'index.css',
  'globals.css',
  'global.css',
  'app.css',
  'main.css',
  'base.css',
  'reset.css',
  'styles.css',
  'style.css',
];

const SCROLLBAR_RULE = `/* Speed-Doctor: prevent CLS from scrollbar appearing/disappearing */
html {
  overflow-y: scroll;
  scrollbar-gutter: stable;
}`;

/**
 * Check if a CSS file already contains scrollbar-gutter or overflow-y: scroll on html.
 */
function hasScrollbarFix(content) {
  // Check for both properties
  const hasScrollbarGutter = /scrollbar-gutter\s*:\s*stable/.test(content);
  const hasOverflowScroll = /html\s*\{[^}]*overflow-y\s*:\s*scroll/.test(content);
  return hasScrollbarGutter || hasOverflowScroll;
}

/**
 * Check if a CSS file already has an `html { }` block.
 * Returns the index of the block start, or -1.
 */
function findHtmlBlock(content) {
  const htmlBlockRe = /\bhtml\s*\{/;
  const match = htmlBlockRe.exec(content);
  return match ? match.index : -1;
}

/**
 * Inject scrollbar fix into an existing `html { }` block in CSS content.
 */
function injectIntoHtmlBlock(content) {
  // Find html { ... } and add properties inside
  return content.replace(
    /(\bhtml\s*\{)([^}]*)(\})/,
    (match, open, inner, close) => {
      // Check if already has the properties
      if (/overflow-y\s*:\s*scroll/.test(inner) || /scrollbar-gutter/.test(inner)) {
        return match; // no change
      }
      const addition = '\n  overflow-y: scroll;\n  scrollbar-gutter: stable;';
      return `${open}${inner.trimEnd()}${addition}\n${close}`;
    }
  );
}

/**
 * Find the best CSS file to inject the scrollbar rule into.
 */
function findTargetCssFile(projectRoot) {
  const srcDirs = ['src', 'styles', 'css', 'app', '.'].map(d => path.join(projectRoot, d));

  // Priority 1: Look for global CSS files by name
  for (const dir of srcDirs) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const name of GLOBAL_CSS_NAMES) {
      const match = entries.find(e => e.isFile() && e.name.toLowerCase() === name);
      if (match) {
        return path.join(dir, match.name);
      }
    }
  }

  // Priority 2: Any CSS file that has `html {` already
  for (const dir of srcDirs) {
    if (!fs.existsSync(dir)) continue;
    const cssFiles = walkDir(dir).filter(f => CSS_EXTENSIONS.has(path.extname(f).toLowerCase()));
    for (const f of cssFiles) {
      const content = readFile(f);
      if (content && findHtmlBlock(content) !== -1) {
        return f;
      }
    }
  }

  // Priority 3: Any .css file in src/
  const srcDir = path.join(projectRoot, 'src');
  if (fs.existsSync(srcDir)) {
    const cssFiles = walkDir(srcDir).filter(f => f.endsWith('.css'));
    if (cssFiles.length > 0) return cssFiles[0];
  }

  return null;
}

async function main() {
  printHeader('Speed-Doctor: Scrollbar Stability (CLS Prevention)');

  const projectRoot = getProjectRoot();
  logInfo(`Project root: ${projectRoot}`);

  const targetFile = findTargetCssFile(projectRoot);

  if (!targetFile) {
    logWarn('No suitable CSS file found to inject scrollbar fix.');
    logInfo('Create an index.css or globals.css file and run again, or add manually:');
    console.log('');
    console.log(SCROLLBAR_RULE);
    return;
  }

  logInfo(`Target file: ${path.relative(projectRoot, targetFile)}\n`);

  const content = readFile(targetFile);
  if (!content) {
    logWarn('Could not read target file.');
    return;
  }

  // Check if fix already applied
  if (hasScrollbarFix(content)) {
    logSkip('Scrollbar fix already present. Nothing to do.');
    return;
  }

  // Try to inject into existing html {} block
  const htmlBlockIdx = findHtmlBlock(content);
  let updated;

  if (htmlBlockIdx !== -1) {
    // Inject into existing html block
    updated = injectIntoHtmlBlock(content);
    if (updated === content) {
      logSkip('Scrollbar properties already in html block.');
      return;
    }
    logInfo('Found existing html {} block. Injecting properties...');
  } else {
    // Prepend rule to file
    updated = SCROLLBAR_RULE + '\n\n' + content;
    logInfo('No html {} block found. Prepending scrollbar rule...');
  }

  writeFile(targetFile, updated);
  logSuccess(`Injected scrollbar stability rule into: ${path.relative(projectRoot, targetFile)}`);

  console.log('');
  logInfo('Rule added:');
  console.log('');
  console.log('    html {');
  console.log('      overflow-y: scroll;');
  console.log('      scrollbar-gutter: stable;');
  console.log('    }');
  console.log('');
  logInfo('This prevents layout shift when scrollbar appears/disappears (improves CLS score).');
}

main().catch(err => {
  console.error('\n  ✖  Error:', err.message);
  process.exit(1);
});
