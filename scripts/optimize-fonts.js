#!/usr/bin/env node
/**
 * optimize-fonts.js
 *
 * Self-hosts Google Fonts by:
 *   1. Detecting @import url("https://fonts.googleapis.com/...") in CSS files
 *   2. Downloading the woff2 (and woff) font files to public/fonts/
 *   3. Replacing the @import with local @font-face rules (font-display: block)
 *   4. Injecting <link rel="preload" as="font"> for critical weights into index.html
 *
 * Usage:
 *   node scripts/optimize-fonts.js [--dir /path/to/project]
 *   npm run optimize:fonts
 *
 * Options:
 *   --dir   Project root directory (defaults to cwd)
 *
 * Idempotent: skips fonts already downloaded and imports already replaced.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const url = require('url');
const { getProjectRoot, walkDir, readFile, writeFile, printHeader, logSuccess, logInfo, logSkip, logWarn } = require('./utils');

const CSS_EXTENSIONS = new Set(['.css', '.scss', '.sass']);

// Regex to find Google Fonts @import statements
const GFONTS_IMPORT_RE = /@import\s+url\(['"]?(https:\/\/fonts\.googleapis\.com\/css2?[^'")\s]+)['"]?\)\s*;/gi;

// CSS2 API endpoint for downloading font face CSS
// We request woff2 by spoofing a modern browser UA
const MODERN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const LEGACY_UA = 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0)';

/**
 * Fetch a URL and return the body as a string or Buffer.
 */
function fetchUrl(rawUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(rawUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        'User-Agent': options.userAgent || MODERN_UA,
        ...(options.headers || {}),
      },
    };

    const req = client.get(reqOptions, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, options).then(resolve).catch(reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode} for ${rawUrl}`));
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(options.binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')));
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error(`Timeout fetching ${rawUrl}`)); });
  });
}

/**
 * Parse font-face rules from CSS text returned by Google Fonts API.
 * Returns array of { family, style, weight, format, src, unicodeRange }
 */
function parseFontFaces(cssText) {
  const faces = [];
  const fontFaceRe = /@font-face\s*\{([^}]+)\}/gi;
  let match;

  while ((match = fontFaceRe.exec(cssText)) !== null) {
    const block = match[1];
    const get = (prop) => {
      const m = new RegExp(`${prop}\\s*:\\s*([^;]+);`, 'i').exec(block);
      return m ? m[1].trim() : '';
    };

    const srcRaw = get('src');
    const urlMatch = /url\(['"]?(https?:\/\/[^'")\s]+\.woff2?)['"]?\)\s*format\(['"]?([^'")\s]+)['"]?\)/i.exec(srcRaw);

    if (!urlMatch) continue;

    faces.push({
      family: get('font-family').replace(/['"]/g, '').trim(),
      style: get('font-style') || 'normal',
      weight: get('font-weight') || '400',
      display: get('font-display') || 'block',
      unicodeRange: get('unicode-range'),
      remoteUrl: urlMatch[1],
      format: urlMatch[2],
    });
  }

  return faces;
}

/**
 * Sanitise a string to a safe filename component.
 */
function safeName(str) {
  return str.replace(/[^a-zA-Z0-9-_]/g, '_').replace(/_+/g, '_').toLowerCase();
}

/**
 * Download a font file to the target path.
 * Returns true if downloaded, false if already exists.
 */
async function downloadFont(remoteUrl, destPath) {
  if (fs.existsSync(destPath)) return false;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const data = await fetchUrl(remoteUrl, { binary: true });
  fs.writeFileSync(destPath, data);
  return true;
}

/**
 * Build a @font-face block for a local font file.
 */
function buildFontFace(face, localPath) {
  const formatStr = face.format.includes('woff2') ? 'woff2' : face.format;
  let block = `@font-face {\n`;
  block += `  font-family: '${face.family}';\n`;
  block += `  font-style: ${face.style};\n`;
  block += `  font-weight: ${face.weight};\n`;
  block += `  font-display: block;\n`;
  block += `  src: url('${localPath}') format('${formatStr}');\n`;
  if (face.unicodeRange) {
    block += `  unicode-range: ${face.unicodeRange};\n`;
  }
  block += `}`;
  return block;
}

/**
 * Inject preload links into index.html for critical font weights (400, 700).
 */
function injectFontPreload(indexHtmlPath, fontFiles) {
  if (!fs.existsSync(indexHtmlPath)) return false;
  let html = readFile(indexHtmlPath);
  if (!html) return false;

  const critical = fontFiles.filter(f =>
    f.weight === '400' || f.weight === '700' || f.weight === 'bold' || f.weight === 'normal'
  );

  let injected = 0;
  for (const f of critical) {
    const tag = `<link rel="preload" as="font" type="font/woff2" crossorigin="anonymous" href="${f.publicPath}">`;
    if (html.includes(tag)) continue;
    html = html.replace('</head>', `  ${tag}\n</head>`);
    injected++;
  }

  if (injected > 0) {
    writeFile(indexHtmlPath, html);
    return true;
  }
  return false;
}

async function main() {
  printHeader('Speed-Doctor: Font Self-Hosting');

  const projectRoot = getProjectRoot();
  const publicDir = path.join(projectRoot, 'public');
  const fontsDir = path.join(publicDir, 'fonts');
  const indexHtmlPath = path.join(projectRoot, 'index.html');

  logInfo(`Project root: ${projectRoot}`);

  // Find all CSS files
  const cssFiles = [];
  const srcDirs = ['src', 'app', 'styles', 'css'].map(d => path.join(projectRoot, d));
  for (const dir of srcDirs) {
    if (fs.existsSync(dir)) {
      walkDir(dir).filter(f => CSS_EXTENSIONS.has(path.extname(f).toLowerCase())).forEach(f => cssFiles.push(f));
    }
  }
  // Also check root
  if (fs.existsSync(projectRoot)) {
    fs.readdirSync(projectRoot, { withFileTypes: true }).forEach(e => {
      if (e.isFile() && CSS_EXTENSIONS.has(path.extname(e.name).toLowerCase())) {
        cssFiles.push(path.join(projectRoot, e.name));
      }
    });
  }

  if (cssFiles.length === 0) {
    logInfo('No CSS files found.');
    return;
  }

  logInfo(`Scanning ${cssFiles.length} CSS file(s) for Google Fonts imports...\n`);

  let totalImports = 0;
  let totalDownloaded = 0;
  const allFontFiles = [];

  for (const cssFile of cssFiles) {
    let content = readFile(cssFile);
    if (!content) continue;

    const imports = [];
    let m;
    const re = new RegExp(GFONTS_IMPORT_RE.source, 'gi');
    while ((m = re.exec(content)) !== null) {
      imports.push({ fullMatch: m[0], apiUrl: m[1] });
    }

    if (imports.length === 0) continue;

    logInfo(`Found ${imports.length} Google Fonts import(s) in ${path.relative(projectRoot, cssFile)}`);
    totalImports += imports.length;

    let updatedContent = content;

    for (const imp of imports) {
      logInfo(`  Fetching font metadata: ${imp.apiUrl}`);

      let fontCss;
      try {
        fontCss = await fetchUrl(imp.apiUrl, { userAgent: MODERN_UA });
      } catch (err) {
        logWarn(`  Failed to fetch ${imp.apiUrl}: ${err.message}`);
        continue;
      }

      const faces = parseFontFaces(fontCss);
      if (faces.length === 0) {
        logWarn(`  No @font-face rules found in API response for: ${imp.apiUrl}`);
        continue;
      }

      logInfo(`  Found ${faces.length} font face variant(s).`);

      // Download font files
      const localFaces = [];
      for (const face of faces) {
        const ext = path.extname(new url.URL(face.remoteUrl).pathname) || '.woff2';
        const filename = `${safeName(face.family)}-${safeName(face.weight)}-${safeName(face.style)}${ext}`;
        const destPath = path.join(fontsDir, filename);
        const publicPath = `/fonts/${filename}`;

        try {
          const downloaded = await downloadFont(face.remoteUrl, destPath);
          if (downloaded) {
            logSuccess(`  Downloaded: ${filename}`);
            totalDownloaded++;
          } else {
            logSkip(`  Already exists: ${filename}`);
          }
          localFaces.push({ ...face, localPath: publicPath, publicPath });
          allFontFiles.push({ ...face, publicPath });
        } catch (err) {
          logWarn(`  Failed to download ${face.remoteUrl}: ${err.message}`);
        }
      }

      if (localFaces.length === 0) continue;

      // Build replacement @font-face blocks
      const fontFaceBlocks = localFaces.map(f => buildFontFace(f, f.localPath)).join('\n\n');

      // Replace the @import with local @font-face rules
      updatedContent = updatedContent.replace(imp.fullMatch, fontFaceBlocks);
    }

    if (updatedContent !== content) {
      writeFile(cssFile, updatedContent);
      logSuccess(`Updated: ${path.relative(projectRoot, cssFile)}`);
    }
  }

  if (totalImports === 0) {
    logInfo('No Google Fonts @import statements found. Nothing to self-host.');
    return;
  }

  // Inject preload links for critical weights
  if (allFontFiles.length > 0 && fs.existsSync(indexHtmlPath)) {
    console.log('');
    logInfo('Injecting font preload links into index.html...');
    const preloaded = injectFontPreload(indexHtmlPath, allFontFiles);
    if (preloaded) {
      logSuccess('Font preload <link> tags injected into index.html');
    } else {
      logSkip('Font preload links already present in index.html');
    }
  }

  console.log('');
  logInfo(`Done. Processed ${totalImports} import(s), downloaded ${totalDownloaded} font file(s).`);
}

main().catch(err => {
  console.error('\n  ✖  Error:', err.message);
  process.exit(1);
});
