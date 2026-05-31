'use strict';

/**
 * findFonts.js
 *
 * Detects external font loading in a project.
 * Looks for:
 *   - @import url("https://fonts.googleapis.com/...") in CSS files
 *   - <link href="https://fonts.googleapis.com/..." rel="stylesheet"> in HTML
 *   - @import url("https://use.typekit.net/...") for Adobe Fonts
 *   - Any @font-face with src pointing to remote URLs
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { walkDir } = require('./findImages');

const CSS_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less']);
const HTML_EXTENSIONS = new Set(['.html', '.htm']);
const JS_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte']);

const KNOWN_FONT_CDNS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'use.typekit.net',
  'pro.fontawesome.com',
  'use.fontawesome.com',
  'cdnjs.cloudflare.com/ajax/libs/font-awesome',
];

/**
 * Parse Google Fonts family names from a CSS2 API URL.
 * e.g. https://fonts.googleapis.com/css2?family=Inter:wght@400;700
 *      => ['Inter']
 */
function parseFamiliesFromUrl(apiUrl) {
  try {
    const url = new URL(apiUrl);
    const families = url.searchParams.getAll('family');
    return families.map(f => f.split(':')[0].replace(/\+/g, ' '));
  } catch {
    return [];
  }
}

/**
 * Detect font imports in CSS content.
 * @param {string} content
 * @param {string} filePath
 * @returns {{ type: string, url: string, families: string[], line: number }[]}
 */
function detectCssImports(content, filePath) {
  const findings = [];
  const lines = content.split('\n');

  lines.forEach((line, i) => {
    const lineNum = i + 1;

    // @import url(...)
    const importMatch = /@import\s+url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/i.exec(line);
    if (importMatch) {
      const url = importMatch[1];
      const isFontCdn = KNOWN_FONT_CDNS.some(cdn => url.includes(cdn));
      if (isFontCdn) {
        findings.push({
          type: 'css-import',
          url,
          families: parseFamiliesFromUrl(url),
          line: lineNum,
          filePath,
        });
      }
    }

    // Remote @font-face src
    const fontFaceMatch = /url\(['"]?(https:\/\/[^'")\s]+\.(woff2?|ttf|otf))['"]?\)/i.exec(line);
    if (fontFaceMatch) {
      findings.push({
        type: 'remote-font-face',
        url: fontFaceMatch[1],
        families: [],
        line: lineNum,
        filePath,
      });
    }
  });

  return findings;
}

/**
 * Detect Google Fonts link tags in HTML content.
 * @param {string} content
 * @param {string} filePath
 * @returns {Array}
 */
function detectHtmlLinks(content, filePath) {
  const findings = [];
  const linkRe = /<link[^>]+href=['"]?(https?:\/\/[^'">\s]+)['"]?[^>]*>/gi;
  let m;

  while ((m = linkRe.exec(content)) !== null) {
    const url = m[1];
    const isFontCdn = KNOWN_FONT_CDNS.some(cdn => url.includes(cdn));
    if (!isFontCdn) continue;

    const lineNum = content.slice(0, m.index).split('\n').length;
    findings.push({
      type: 'html-link',
      url,
      families: parseFamiliesFromUrl(url),
      line: lineNum,
      filePath,
    });
  }

  return findings;
}

/**
 * Find all external font dependencies in a project.
 *
 * @param {string} projectRoot
 * @returns {{ type: string, url: string, families: string[], line: number, filePath: string }[]}
 */
function findFonts(projectRoot) {
  const findings = [];

  const dirsToScan = [
    path.join(projectRoot, 'src'),
    path.join(projectRoot, 'styles'),
    path.join(projectRoot, 'css'),
    path.join(projectRoot, 'app'),
    projectRoot,  // root-level CSS/HTML
  ];

  const scanned = new Set();

  for (const dir of dirsToScan) {
    if (!fs.existsSync(dir)) continue;

    const files = dir === projectRoot
      ? fs.readdirSync(dir, { withFileTypes: true })
          .filter(e => e.isFile())
          .map(e => path.join(dir, e.name))
      : walkDir(dir);

    for (const filePath of files) {
      if (scanned.has(filePath)) continue;
      scanned.add(filePath);

      const ext = path.extname(filePath).toLowerCase();
      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }

      if (CSS_EXTENSIONS.has(ext)) {
        detectCssImports(content, filePath).forEach(f => findings.push(f));
      } else if (HTML_EXTENSIONS.has(ext)) {
        detectHtmlLinks(content, filePath).forEach(f => findings.push(f));
      }
    }
  }

  return findings;
}

/**
 * Check if fonts are already self-hosted (public/fonts/ directory exists with files).
 * @param {string} projectRoot
 * @returns {boolean}
 */
function areFontsSelfHosted(projectRoot) {
  const fontsDir = path.join(projectRoot, 'public', 'fonts');
  if (!fs.existsSync(fontsDir)) return false;
  const files = fs.readdirSync(fontsDir);
  return files.some(f => /\.(woff2?|ttf|otf)$/.test(f));
}

module.exports = { findFonts, areFontsSelfHosted, parseFamiliesFromUrl };
