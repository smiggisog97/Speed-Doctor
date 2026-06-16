#!/usr/bin/env node
/**
 * optimize-motion.js
 *
 * Adds a prefers-reduced-motion safety net to global CSS.
 *
 * Why: Browsers/OSes let users request "reduced motion" (battery-saver mode,
 * vestibular disorder accessibility setting). Without a CSS guard, ALL animations
 * still run at full speed — wasting CPU, causing stutter on low-power devices,
 * and potentially harming users with motion sensitivities.
 *
 * Real-world lesson: a portfolio site's scroll marquee ran at 10× normal speed
 * on reduced-motion systems because the JS animation used system clock deltas
 * but the CSS transition fallback still fired. The CSS guard below fixes the
 * CSS layer; JS animation loops should also check matchMedia separately.
 *
 * What it injects (once, idempotent):
 *
 *   @media (prefers-reduced-motion: reduce) {
 *     *, *::before, *::after {
 *       animation-duration: 0.01ms !important;
 *       animation-iteration-count: 1 !important;
 *       transition-duration: 0.01ms !important;
 *       scroll-behavior: auto !important;
 *     }
 *   }
 *
 * This overrides every animation/transition for users who opted into reduced motion.
 * It does NOT touch reduced-motion: no-preference users — zero design impact for them.
 *
 * Usage:
 *   node scripts/optimize-motion.js [--dir /path/to/project]
 *   npm run optimize:motion
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  getProjectRoot, walkDir, readFile, writeFile,
  printHeader, logSuccess, logInfo, logSkip, logWarn,
} = require('./utils');

const GLOBAL_CSS_NAMES = [
  'index.css', 'globals.css', 'global.css', 'app.css',
  'main.css', 'base.css', 'reset.css', 'styles.css', 'style.css',
];

const MOTION_RULE = `
/* Speed-Doctor: respect user's reduced-motion preference */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}`;

function hasMotionGuard(content) {
  return /prefers-reduced-motion\s*:\s*reduce/.test(content);
}

function findGlobalCss(projectRoot) {
  const srcDirs = ['src', 'styles', 'css', 'app', '.'].map(d => path.join(projectRoot, d));
  for (const dir of srcDirs) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const name of GLOBAL_CSS_NAMES) {
      const match = entries.find(e => e.isFile() && e.name.toLowerCase() === name);
      if (match) return path.join(dir, match.name);
    }
  }
  // Fallback: any .css in src/ that has animation or transition rules
  const srcDir = path.join(projectRoot, 'src');
  if (fs.existsSync(srcDir)) {
    const cssFiles = walkDir(srcDir).filter(f => f.endsWith('.css'));
    for (const f of cssFiles) {
      const c = readFile(f);
      if (c && /animation|transition/.test(c)) return f;
    }
    if (cssFiles.length > 0) return cssFiles[0];
  }
  return null;
}

async function main() {
  printHeader('Speed-Doctor: Reduced-Motion Safety Net');

  const projectRoot = getProjectRoot();
  logInfo(`Project root: ${projectRoot}`);

  const target = findGlobalCss(projectRoot);
  if (!target) {
    logWarn('No global CSS file found. Create index.css and run again.');
    logInfo('Add this block manually:');
    console.log(MOTION_RULE);
    return;
  }

  logInfo(`Target: ${path.relative(projectRoot, target)}\n`);

  const content = readFile(target);
  if (!content) { logWarn('Could not read file.'); return; }

  if (hasMotionGuard(content)) {
    logSkip('prefers-reduced-motion guard already present. Nothing to do.');
    return;
  }

  writeFile(target, content + MOTION_RULE + '\n');
  logSuccess(`Appended reduced-motion guard to: ${path.relative(projectRoot, target)}`);
  console.log('');
  logInfo('Users with "Reduce Motion" OS setting will now see instant transitions.');
  logInfo('Zero impact on users without the setting — no design changes.');
  console.log('');
}

main().catch(err => {
  console.error('\n  ✖  Error:', err.message);
  process.exit(1);
});
