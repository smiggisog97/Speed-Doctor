#!/usr/bin/env node
/**
 * Speed-Doctor: Master Runner
 *
 * Runs all optimization scripts in sequence, catches errors per-script,
 * outputs a colored summary, and generates OPTIMIZATION_REPORT.md.
 *
 * Usage:
 *   node scripts/index.js [--dir /path/to/project]
 *   npm run speed-doctor
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ─── Color helpers (no external deps) ───────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
  white:  '\x1b[97m',
};

function green(s)  { return `${c.green}${s}${c.reset}`; }
function yellow(s) { return `${c.yellow}${s}${c.reset}`; }
function red(s)    { return `${c.red}${s}${c.reset}`; }
function cyan(s)   { return `${c.cyan}${s}${c.reset}`; }
function bold(s)   { return `${c.bold}${s}${c.reset}`; }
function gray(s)   { return `${c.gray}${s}${c.reset}`; }

// ─── Banner ──────────────────────────────────────────────────────────────────
function printBanner() {
  console.log('');
  console.log(bold(cyan('  ╔══════════════════════════════════════════════╗')));
  console.log(bold(cyan('  ║          Speed-Doctor  v1.1.0               ║')));
  console.log(bold(cyan('  ║   Autonomous Website Performance Optimizer   ║')));
  console.log(bold(cyan('  ╚══════════════════════════════════════════════╝')));
  console.log('');
}

// ─── Script definitions ──────────────────────────────────────────────────────
const SCRIPTS_DIR = path.join(__dirname);

const STEPS = [
  {
    name: 'Image Compression & WebP Conversion',
    script: path.join(SCRIPTS_DIR, 'optimize-images.js'),
    key: 'images',
  },
  {
    name: 'Font Self-Hosting',
    script: path.join(SCRIPTS_DIR, 'optimize-fonts.js'),
    key: 'fonts',
  },
  {
    name: 'Preload & Prefetch Injection',
    script: path.join(SCRIPTS_DIR, 'optimize-preload.js'),
    key: 'preload',
  },
  {
    name: 'Lazy Loading Audit & Fix',
    script: path.join(SCRIPTS_DIR, 'optimize-lazy.js'),
    key: 'lazy',
  },
  {
    name: 'Image Decoding (async off main thread)',
    script: path.join(SCRIPTS_DIR, 'optimize-decoding.js'),
    key: 'decoding',
  },
  {
    name: 'Reduced-Motion Safety Net',
    script: path.join(SCRIPTS_DIR, 'optimize-motion.js'),
    key: 'motion',
  },
  {
    name: 'RAF Rate-Independence Audit',
    script: path.join(SCRIPTS_DIR, 'audit-raf.js'),
    key: 'raf',
  },
];

// ─── Run a single script ─────────────────────────────────────────────────────
function runScript(step, extraArgs) {
  const args = [step.script, ...extraArgs];
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  return {
    success: result.status === 0,
    error: result.error ? result.error.message : null,
    exitCode: result.status,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  printBanner();

  // Collect --dir and other forwarded args
  const extraArgs = [];
  const dirIdx = process.argv.indexOf('--dir');
  if (dirIdx !== -1 && process.argv[dirIdx + 1]) {
    extraArgs.push('--dir', process.argv[dirIdx + 1]);
  }

  const projectRoot = dirIdx !== -1 ? path.resolve(process.argv[dirIdx + 1]) : process.cwd();

  console.log(bold(`  Project: ${projectRoot}`));
  console.log(gray(`  Running ${STEPS.length} optimization passes...\n`));

  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    const stepNum = `[${i + 1}/${STEPS.length}]`;
    console.log(bold(`\n${stepNum} ${cyan(step.name)}`));
    console.log(gray('  ' + '─'.repeat(50)));

    const stepStart = Date.now();
    const outcome = runScript(step, extraArgs);
    const elapsed = ((Date.now() - stepStart) / 1000).toFixed(1);

    if (outcome.success) {
      results.push({ ...step, status: 'ok', elapsed });
      console.log(green(`\n  Done in ${elapsed}s`));
    } else if (outcome.error) {
      results.push({ ...step, status: 'error', error: outcome.error, elapsed });
      console.log(red(`\n  Error: ${outcome.error}`));
    } else {
      results.push({ ...step, status: 'failed', exitCode: outcome.exitCode, elapsed });
      console.log(yellow(`\n  Finished with exit code ${outcome.exitCode} in ${elapsed}s`));
    }
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n');
  console.log(bold(cyan('  ┌─────────────────────────────────────────────┐')));
  console.log(bold(cyan('  │              Optimization Summary            │')));
  console.log(bold(cyan('  └─────────────────────────────────────────────┘')));
  console.log('');

  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const icon = r.status === 'ok' ? green('✔') : (r.status === 'error' ? red('✖') : yellow('⚠'));
    const time = gray(`(${r.elapsed}s)`);
    const name = r.status === 'ok' ? r.name : (r.status === 'error' ? red(r.name) : yellow(r.name));
    console.log(`  ${icon}  ${name}  ${time}`);
    if (r.status === 'ok') passed++;
    else failed++;
  }

  console.log('');
  console.log(bold(`  Total: ${green(passed + ' passed')}, ${failed > 0 ? red(failed + ' failed') : gray('0 failed')}  ${gray('in ' + totalElapsed + 's')}`));
  console.log('');

  // ── Generate report ────────────────────────────────────────────────────────
  try {
    const reportScript = path.join(SCRIPTS_DIR, 'report.js');
    if (fs.existsSync(reportScript)) {
      console.log(bold(cyan('  Generating OPTIMIZATION_REPORT.md...')));
      const reportResult = spawnSync(process.execPath, [reportScript, ...extraArgs], {
        stdio: 'inherit',
        env: { ...process.env, FORCE_COLOR: '1' },
      });
      if (reportResult.status === 0) {
        console.log(green('  Report saved to OPTIMIZATION_REPORT.md'));
      }
    }
  } catch (e) {
    console.log(yellow('  Could not generate report: ' + e.message));
  }

  console.log('');
  console.log(bold(cyan('  Speed-Doctor complete. Review OPTIMIZATION_REPORT.md for details.')));
  console.log('');

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(red('\n  Fatal error: ' + err.message));
  process.exit(1);
});
