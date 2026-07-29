#!/usr/bin/env node
/**
 * Report-only audit for device/browser-specific performance failures.
 *
 * Finds patterns that can look correct on a fast development machine but
 * degrade on reduced-motion, high-DPR, software-rendered, or cold-cache
 * browsers. This script never modifies project files.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  getProjectRoot, walkDir, readFile,
  printHeader, logSuccess, logInfo, logWarn,
} = require('./utils');

const SOURCE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.html', '.css', '.scss']);

function lineNumber(content, index) {
  return content.slice(0, index).split('\n').length;
}

function mediaBlockAt(content, start) {
  const open = content.indexOf('{', start);
  if (open === -1) return content.slice(start, start + 1600);
  let depth = 0;
  for (let i = open; i < content.length; i++) {
    if (content[i] === '{') depth++;
    if (content[i] === '}') depth--;
    if (depth === 0) return content.slice(start, i + 1);
  }
  return content.slice(start, start + 1600);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function analyzeDeviceCompatibility(projectRoot) {
  const findings = [];
  const seen = new Set();
  const add = (finding) => {
    const key = `${finding.rule}:${finding.file}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(finding);
  };

  const scanRoots = ['src', 'app', 'pages', 'components']
    .map((dir) => path.join(projectRoot, dir))
    .filter((dir) => fs.existsSync(dir));
  const files = new Set();
  for (const root of scanRoots) {
    walkDir(root)
      .filter((file) => SOURCE_EXTS.has(path.extname(file).toLowerCase()))
      .forEach((file) => files.add(file));
  }
  fs.readdirSync(projectRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && SOURCE_EXTS.has(path.extname(entry.name).toLowerCase()))
    .forEach((entry) => files.add(path.join(projectRoot, entry.name)));

  for (const filePath of files) {
    const content = readFile(filePath);
    if (!content) continue;
    const file = path.relative(projectRoot, filePath);
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.css' || ext === '.scss') {
      const mediaRe = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/gi;
      let mediaMatch;
      while ((mediaMatch = mediaRe.exec(content)) !== null) {
        const block = mediaBlockAt(content, mediaMatch.index);
        const transformMatch = /transform\s*:\s*none\s*!important/gi.exec(block);
        if (transformMatch) {
          const ruleOpen = block.lastIndexOf('{', transformMatch.index);
          const previousRuleEnd = block.lastIndexOf('}', ruleOpen);
          const mediaOpen = block.indexOf('{');
          const selectorText = block.slice(Math.max(previousRuleEnd, mediaOpen) + 1, ruleOpen);
          const selectors = selectorText.split(',').map((selector) => selector.trim()).filter(Boolean);
          const absoluteSelector = selectors.find((selector) => {
            const selectorRule = new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)`, 's').exec(content);
            if (!selectorRule || !/position\s*:\s*absolute/.test(selectorRule[1])) return false;
            return /(physics|drag|pill)/i.test(selector) || /touch-action\s*:\s*none/.test(selectorRule[1]);
          });
          if (absoluteSelector) {
            add({
              rule: 'reduced-motion-layout',
              severity: 'high',
              file,
              line: lineNumber(content, mediaMatch.index + transformMatch.index),
              message: `Reduced-motion CSS removes transforms from absolute element ${absoluteSelector}; transform-positioned UI can collapse to its DOM origin.`,
            });
          }
        }
      }
    }

    const reducedRe = /\b(?:reducedMotion|reduceMotion|prefersReducedMotion)\b/g;
    let reducedMatch;
    while ((reducedMatch = reducedRe.exec(content)) !== null) {
      const context = content.slice(Math.max(0, reducedMatch.index - 500), reducedMatch.index + 700);
      if (/(pointerdown|pointermove|pointerup|drag|setPointerCapture|touchstart)/i.test(context)
          && /(return|preventDefault|addEventListener)/.test(context)) {
        add({
          rule: 'reduced-motion-interaction',
          severity: 'high',
          file,
          line: lineNumber(content, reducedMatch.index),
          message: 'Reduced-motion logic is coupled to direct manipulation; verify links, taps, and dragging still have a usable fallback.',
        });
      }
    }

    if (/getContext\(\s*['"]2d['"]/.test(content) && /devicePixelRatio/.test(content)
        && !/Math\.min\s*\([^)]*devicePixelRatio/.test(content)) {
      const index = content.indexOf('devicePixelRatio');
      add({
        rule: 'uncapped-canvas-dpr',
        severity: 'medium',
        file,
        line: lineNumber(content, index),
        message: 'Canvas uses devicePixelRatio without an obvious cap; high-DPR displays may multiply pixel and game-loop work.',
      });
    }

    const webglMatch = /getContext\(\s*['"]webgl2?['"]/.exec(content);
    if (webglMatch && !/webglcontextlost/.test(content)) {
      add({
        rule: 'webgl-context-loss',
        severity: 'medium',
        file,
        line: lineNumber(content, webglMatch.index),
        message: 'WebGL is used without a context-loss handler; keep equivalent DOM content visible if GPU acceleration fails.',
      });
    }

    const priorityMatches = content.match(/loading\s*=\s*["']eager["']|fetchPriority\s*=\s*["'{]?high|fetchpriority\s*=\s*["']high["']|\.fetchPriority\s*=\s*["']high["']/g) || [];
    if (priorityMatches.length >= 12) {
      const first = content.search(/loading\s*=\s*["']eager["']|fetchPriority|fetchpriority/);
      add({
        rule: 'priority-flood',
        severity: 'medium',
        file,
        line: lineNumber(content, first),
        message: `${priorityMatches.length} eager/high-priority image hints appear in one file; verify they do not compete with truly critical assets on a cold connection.`,
      });
    }
  }

  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

async function main() {
  const projectRoot = getProjectRoot();
  const findings = analyzeDeviceCompatibility(projectRoot);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(findings, null, 2));
    return;
  }

  printHeader('Speed-Doctor: Device Compatibility Audit');
  logInfo(`Project root: ${projectRoot}`);
  logInfo('Checking reduced motion, direct interaction, canvas DPR, WebGL fallback, and image priority...\n');

  if (findings.length === 0) {
    logSuccess('No device-specific risk patterns found.');
  } else {
    logWarn(`Found ${findings.length} pattern(s) for manual browser review:`);
    console.log('');
    for (const finding of findings) {
      console.log(`  ${finding.severity.toUpperCase()}  ${finding.file}:${finding.line}`);
      console.log(`        ${finding.message}`);
    }
  }

  console.log('');
  logInfo('Report only: no project files were modified.');
  console.log('');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('\n  ✖  Error:', error.message);
    process.exit(1);
  });
}

module.exports = { analyzeDeviceCompatibility };
