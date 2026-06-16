#!/usr/bin/env node
/**
 * audit-raf.js
 *
 * Audits requestAnimationFrame loops for the 120Hz runaway bug.
 *
 * Problem: rAF fires as fast as the display refreshes — 120Hz monitors fire it
 * twice as often as 60Hz. Any animation that moves things by a fixed pixel amount
 * per rAF call will run 2× faster on a 120Hz screen. Same applies to game loops,
 * scroll marquees, canvas animations, and counters.
 *
 * Fix pattern: use a fixed-timestep guard (compare performance.now() deltas and
 * only advance the simulation when enough real time has passed):
 *
 *   const STEP = 1000 / 60;        // 16.67ms = one 60Hz frame
 *   let lastUpdate = performance.now();
 *
 *   function draw() {
 *     const now = performance.now();
 *     let elapsed = now - lastUpdate;
 *     if (elapsed > 250) elapsed = STEP;  // guard: tab was backgrounded
 *     const steps = Math.floor(elapsed / STEP);
 *     if (steps > 0) { lastUpdate += steps * STEP; simulate(steps); }
 *     requestAnimationFrame(draw);
 *   }
 *
 * This pass is REPORT-ONLY — it never modifies source files, as rAF loops are
 * business logic. It finds loops that call rAF without a time-delta check and
 * outputs file + line numbers so the developer can apply the fix manually.
 *
 * Usage:
 *   node scripts/audit-raf.js [--dir /path/to/project]
 *   npm run audit:raf
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  getProjectRoot, walkDir, readFile,
  printHeader, logSuccess, logInfo, logSkip, logWarn,
} = require('./utils');

const SOURCE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte']);

// Keywords that indicate a time-delta guard is in place
const TIME_GUARD_PATTERNS = [
  /performance\.now/,
  /Date\.now/,
  /deltaTime/i,
  /elapsed/i,
  /lastTime/i,
  /lastUpdate/i,
  /lastFrame/i,
  /fixedStep/i,
  /STEP\s*=/,
  /frameTime/i,
  /accumulator/i,
];

function hasTimeGuard(fnBody) {
  return TIME_GUARD_PATTERNS.some(re => re.test(fnBody));
}

/**
 * Extract approximate function body (or surrounding ~400 chars) for a rAF call.
 */
function getBody(content, matchIndex, radius = 600) {
  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(content.length, matchIndex + radius);
  return content.slice(start, end);
}

function getLineNumber(content, index) {
  return content.slice(0, index).split('\n').length;
}

async function main() {
  printHeader('Speed-Doctor: RAF Rate-Independence Audit');

  const projectRoot = getProjectRoot();
  logInfo(`Project root: ${projectRoot}`);
  logInfo('Scanning for requestAnimationFrame loops without time-delta guards...\n');

  const srcDirs = ['src', 'app', 'pages', 'components', 'scripts', 'lib'].map(d => path.join(projectRoot, d));
  const sourceFiles = [];

  for (const dir of srcDirs) {
    if (fs.existsSync(dir)) {
      walkDir(dir)
        .filter(f => SOURCE_EXTS.has(path.extname(f).toLowerCase()))
        .forEach(f => sourceFiles.push(f));
    }
  }

  // Also check root-level JS files
  fs.readdirSync(projectRoot)
    .filter(f => SOURCE_EXTS.has(path.extname(f).toLowerCase()))
    .forEach(f => sourceFiles.push(path.join(projectRoot, f)));

  if (sourceFiles.length === 0) {
    logInfo('No source files found.');
    return;
  }

  const rafRe = /\brequestAnimationFrame\s*\(/g;
  const flagged = [];

  for (const filePath of sourceFiles) {
    const content = readFile(filePath);
    if (!content) continue;

    let m;
    while ((m = rafRe.exec(content)) !== null) {
      const body = getBody(content, m.index);
      if (!hasTimeGuard(body)) {
        flagged.push({
          file: path.relative(projectRoot, filePath),
          line: getLineNumber(content, m.index),
        });
      }
    }
  }

  console.log('');
  if (flagged.length === 0) {
    logSuccess('No unguarded rAF loops found. All animation loops appear rate-independent.');
  } else {
    logWarn(`Found ${flagged.length} rAF call(s) without a time-delta guard:`);
    console.log('');
    for (const f of flagged) {
      console.log(`  ⚠  ${f.file}:${f.line}`);
    }
    console.log('');
    logInfo('These loops may run at 2× speed on 120Hz displays.');
    logInfo('Fix: use a fixed-timestep accumulator (see script header for pattern).');
    logInfo('See docs/optimization-guide.md for full details.');
  }

  console.log('');
  logInfo('Note: This pass is report-only. No files were modified.');
  console.log('');
}

main().catch(err => {
  console.error('\n  ✖  Error:', err.message);
  process.exit(1);
});
