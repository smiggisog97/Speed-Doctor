#!/usr/bin/env node
/**
 * report.js
 *
 * Generates OPTIMIZATION_REPORT.md based on analysis of what Speed-Doctor
 * has done to the project. Reads modified files and generates a markdown
 * report with metrics, counts, and recommendations.
 *
 * Usage:
 *   node scripts/report.js [--dir /path/to/project]
 *   npm run report
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getProjectRoot, walkDir, readFile, writeFile, printHeader, logSuccess, logInfo, logSkip, logWarn } = require('./utils');

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);

/**
 * Count WebP files vs originals to infer conversions.
 */
function auditImages(projectRoot) {
  const publicDir = path.join(projectRoot, 'public');
  const scanDir = fs.existsSync(publicDir) ? publicDir : projectRoot;

  const originals = [];
  const webps = [];

  walkDir(scanDir).forEach(f => {
    const ext = path.extname(f).toLowerCase();
    if (ext === '.webp') webps.push(f);
    else if (['.png', '.jpg', '.jpeg'].includes(ext)) originals.push(f);
  });

  // Estimate KB saved: average WebP is ~30% smaller than JPEG, ~60% smaller than PNG
  let estimatedKbSaved = 0;
  for (const webpPath of webps) {
    const webpStat = fs.existsSync(webpPath) ? fs.statSync(webpPath) : null;
    const webpKb = webpStat ? webpStat.size / 1024 : 0;
    // Estimate original would have been ~40% larger
    estimatedKbSaved += webpKb * 0.4;
  }

  return {
    originalCount: originals.length,
    webpCount: webps.length,
    estimatedKbSaved: Math.round(estimatedKbSaved),
  };
}

/**
 * Audit self-hosted fonts.
 */
function auditFonts(projectRoot) {
  const fontsDir = path.join(projectRoot, 'public', 'fonts');
  if (!fs.existsSync(fontsDir)) return { count: 0, families: [] };

  const fontFiles = fs.readdirSync(fontsDir).filter(f => /\.(woff2?|ttf|otf)$/.test(f));
  const families = new Set(fontFiles.map(f => f.split('-')[0].replace(/_/g, ' ')));

  return {
    count: fontFiles.length,
    families: [...families],
  };
}

/**
 * Audit preload/prefetch tags in index.html.
 */
function auditPreloads(projectRoot) {
  const indexHtml = path.join(projectRoot, 'index.html');
  if (!fs.existsSync(indexHtml)) return { preloads: 0, prefetches: 0 };

  const content = readFile(indexHtml) || '';
  const preloads = (content.match(/<link\s+rel="preload"/gi) || []).length;
  const prefetches = (content.match(/<link\s+rel="prefetch"/gi) || []).length;

  return { preloads, prefetches };
}

/**
 * Audit lazy loading fixes.
 */
function auditLazyFixes(projectRoot) {
  const srcDir = path.join(projectRoot, 'src');
  if (!fs.existsSync(srcDir)) return { eagerImages: 0, lazyImages: 0 };

  let eagerImages = 0;
  let lazyImages = 0;

  walkDir(srcDir).forEach(f => {
    if (!['.jsx', '.tsx', '.html'].includes(path.extname(f).toLowerCase())) return;
    const content = readFile(f);
    if (!content) return;
    const eager = (content.match(/fetchpriority=["']high["']/gi) || []).length;
    const lazy = (content.match(/loading=["']lazy["']/gi) || []).length;
    eagerImages += eager;
    lazyImages += lazy;
  });

  return { eagerImages, lazyImages };
}

/**
 * Audit scrollbar fix.
 */
function auditScrollbar(projectRoot) {
  const cssExtensions = new Set(['.css', '.scss', '.sass']);
  const srcDirs = ['src', 'styles', 'css', '.'].map(d => path.join(projectRoot, d));

  for (const dir of srcDirs) {
    if (!fs.existsSync(dir)) continue;
    const cssFiles = walkDir(dir).filter(f => cssExtensions.has(path.extname(f).toLowerCase()));
    for (const f of cssFiles) {
      const content = readFile(f);
      if (content && /scrollbar-gutter\s*:\s*stable/.test(content)) {
        return { fixed: true, file: path.relative(projectRoot, f) };
      }
    }
  }

  return { fixed: false, file: null };
}

/**
 * Estimate LCP improvement based on optimizations applied.
 */
function estimateLcpImprovement(images, fonts, preloads, lazy, scrollbar) {
  let improvement = 0;
  const breakdown = [];

  if (images.webpCount > 0) {
    const imgImprovement = Math.min(30, images.webpCount * 3);
    improvement += imgImprovement;
    breakdown.push(`WebP conversion: ~${imgImprovement}% faster image load`);
  }

  if (fonts.count > 0) {
    improvement += 15;
    breakdown.push('Font self-hosting: ~15% reduction in render-blocking');
  }

  if (preloads.preloads > 0) {
    const preloadImprovement = Math.min(25, preloads.preloads * 8);
    improvement += preloadImprovement;
    breakdown.push(`Critical preloads: ~${preloadImprovement}% faster LCP asset fetch`);
  }

  if (lazy.eagerImages > 0) {
    improvement += 10;
    breakdown.push('Lazy→Eager fix: ~10% faster LCP for hero images');
  }

  if (scrollbar.fixed) {
    breakdown.push('Scrollbar gutter: CLS eliminated for scrollbar shift');
  }

  return {
    total: Math.min(improvement, 60),
    breakdown,
  };
}

function formatDate() {
  return new Date().toISOString().split('T')[0];
}

function generateReport(projectRoot) {
  const images = auditImages(projectRoot);
  const fonts = auditFonts(projectRoot);
  const preloads = auditPreloads(projectRoot);
  const lazy = auditLazyFixes(projectRoot);
  const scrollbar = auditScrollbar(projectRoot);
  const lcp = estimateLcpImprovement(images, fonts, preloads, lazy, scrollbar);

  const projectName = path.basename(projectRoot);

  const lines = [
    `# Speed-Doctor Optimization Report`,
    ``,
    `**Project:** \`${projectName}\`  `,
    `**Date:** ${formatDate()}  `,
    `**Tool:** Speed-Doctor v1.0.0`,
    ``,
    `---`,
    ``,
    `## Summary`,
    ``,
    `| Optimization | Status | Details |`,
    `|---|---|---|`,
    `| Image WebP Conversion | ${images.webpCount > 0 ? '✅ Applied' : '⏭ Skipped'} | ${images.webpCount} WebP file(s), ~${images.estimatedKbSaved} KB saved |`,
    `| Font Self-Hosting | ${fonts.count > 0 ? '✅ Applied' : '⏭ Skipped'} | ${fonts.count} font file(s) downloaded |`,
    `| Preload/Prefetch | ${preloads.preloads + preloads.prefetches > 0 ? '✅ Applied' : '⏭ Skipped'} | ${preloads.preloads} preload, ${preloads.prefetches} prefetch tag(s) |`,
    `| Lazy Loading Audit | ${lazy.eagerImages > 0 ? '✅ Fixed' : '✅ Passed'} | ${lazy.eagerImages} above-fold image(s) set to eager |`,
    `| Scrollbar Stability | ${scrollbar.fixed ? '✅ Applied' : '⏭ Not needed'} | ${scrollbar.fixed ? `CLS fix in \`${scrollbar.file}\`` : 'No global CSS found or already set'} |`,
    ``,
    `---`,
    ``,
    `## Estimated LCP Improvement`,
    ``,
    `**~${lcp.total}% faster perceived load time**`,
    ``,
    ...(lcp.breakdown.length > 0
      ? ['Breakdown:', ...lcp.breakdown.map(b => `- ${b}`), '']
      : []),
    `> Note: Actual improvement depends on network conditions, server response times,`,
    `> and browser caching. Run Lighthouse before and after to measure precisely.`,
    ``,
    `---`,
    ``,
    `## Image Optimization`,
    ``,
    `- **Original images found:** ${images.originalCount}`,
    `- **WebP files present:** ${images.webpCount}`,
    `- **Estimated savings:** ~${images.estimatedKbSaved} KB`,
    ``,
    images.originalCount > 0 && images.webpCount === 0
      ? `> Original images were found but no WebP versions exist yet. Run \`npm run optimize:images\` to convert them.`
      : `> Original images are preserved alongside WebP versions. Remove originals once verified working.`,
    ``,
    `---`,
    ``,
    `## Font Self-Hosting`,
    ``,
    fonts.count > 0
      ? [
          `- **Font files downloaded:** ${fonts.count}`,
          `- **Font families:** ${fonts.families.join(', ') || 'unknown'}`,
          `- **Location:** \`public/fonts/\``,
          `- **Font display:** \`block\` (prevents invisible text flash)`,
          ``,
          `> Font preload tags have been injected into \`index.html\` for critical weights.`,
        ].join('\n')
      : `No Google Fonts \`@import\` statements were found. If you have fonts loaded via CDN, add them to a CSS file and re-run.`,
    ``,
    `---`,
    ``,
    `## Preload & Prefetch`,
    ``,
    `- **Preload tags injected:** ${preloads.preloads}`,
    `- **Prefetch tags injected:** ${preloads.prefetches}`,
    ``,
    preloads.preloads > 0
      ? `> Critical above-fold assets are now preloaded, reducing LCP time.`
      : `> No above-fold images were detected in public/ that matched known heuristics.`,
    ``,
    `---`,
    ``,
    `## Lazy Loading`,
    ``,
    `- **Above-fold images fixed (lazy → eager):** ${lazy.eagerImages}`,
    `- **Correctly lazy-loaded images kept:** ${lazy.lazyImages}`,
    ``,
    lazy.eagerImages > 0
      ? `> Hero/banner images were incorrectly set to \`loading="lazy"\`. They are now \`loading="eager" fetchpriority="high"\`.`
      : `> All lazy-loaded images appear to be correctly placed below the fold.`,
    ``,
    `---`,
    ``,
    `## Scrollbar Stability`,
    ``,
    scrollbar.fixed
      ? [
          `- **Status:** Fixed`,
          `- **File:** \`${scrollbar.file}\``,
          ``,
          `Added to the \`html\` selector:`,
          `\`\`\`css`,
          `html {`,
          `  overflow-y: scroll;`,
          `  scrollbar-gutter: stable;`,
          `}`,
          `\`\`\``,
          ``,
          `> This prevents the page from shifting when a scrollbar appears/disappears, improving CLS score.`,
        ].join('\n')
      : `No action taken. Either the fix is already present or no global CSS file was found.`,
    ``,
    `---`,
    ``,
    `## Remaining Recommendations`,
    ``,
    `These are not automated by Speed-Doctor but are worth addressing:`,
    ``,
    `- [ ] **Serve images from a CDN** — reduces TTFB for image assets globally`,
    `- [ ] **Enable HTTP/2 or HTTP/3** — multiplexes requests, reduces latency`,
    `- [ ] **Add Cache-Control headers** — \`max-age=31536000\` for hashed assets`,
    `- [ ] **Audit bundle size** — use \`vite-bundle-visualizer\` or \`source-map-explorer\``,
    `- [ ] **Enable Brotli compression** on your server/CDN`,
    `- [ ] **Defer non-critical JS** — review scripts loaded in \`<head>\``,
    `- [ ] **Use \`rel="preconnect"\`** for third-party origins (analytics, etc.)`,
    `- [ ] **Audit Core Web Vitals** with Lighthouse: \`npx lighthouse <url>\``,
    ``,
    `---`,
    ``,
    `*Generated by [Speed-Doctor](https://github.com/smiggisog97/Speed-Doctor)*`,
  ];

  return lines.join('\n');
}

async function main() {
  printHeader('Speed-Doctor: Report Generator');

  const projectRoot = getProjectRoot();
  logInfo(`Project root: ${projectRoot}`);

  const reportContent = generateReport(projectRoot);
  const reportPath = path.join(projectRoot, 'OPTIMIZATION_REPORT.md');

  writeFile(reportPath, reportContent);
  logSuccess(`Report written to: ${path.relative(projectRoot, reportPath)}`);
  console.log('');
}

main().catch(err => {
  console.error('\n  Error:', err.message);
  process.exit(1);
});
