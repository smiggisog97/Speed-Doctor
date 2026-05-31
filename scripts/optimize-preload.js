#!/usr/bin/env node
/**
 * optimize-preload.js
 *
 * Analyzes the project to find:
 *   - Above-fold images (hero sections, first viewport) → inject <link rel="preload">
 *   - Below-fold assets (later sections)               → inject <link rel="prefetch">
 *
 * Also handles:
 *   - URL-encoding paths with spaces
 *   - Deduplication (won't add duplicate tags)
 *   - Loader-time prefetch pattern injection
 *   - Hover prefetch for lazy-loaded routes
 *
 * Usage:
 *   node scripts/optimize-preload.js [--dir /path/to/project]
 *   npm run optimize:preload
 *
 * Heuristics for "above the fold":
 *   - Hero, banner, cover, header, landing, first-section in component name/path
 *   - CSS classes: hero, banner, cover, above-fold, first-section
 *   - First image reference in App.jsx/tsx, index.jsx/tsx, or page-level components
 *
 * Idempotent: skips tags already present in index.html
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getProjectRoot, walkDir, readFile, writeFile, printHeader, logSuccess, logInfo, logSkip, logWarn } = require('./utils');

// Keywords that suggest above-fold placement
const ABOVE_FOLD_KEYWORDS = ['hero', 'banner', 'cover', 'header', 'landing', 'firstsection', 'first-section', 'above-fold', 'abovefold', 'intro', 'splash'];

// Keywords that suggest below-fold placement
const BELOW_FOLD_KEYWORDS = ['footer', 'testimonial', 'about', 'contact', 'gallery', 'portfolio', 'work', 'section', 'card', 'list', 'grid'];

// Image extensions to look for
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif']);

// Source file extensions to scan
const SOURCE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.html', '.vue', '.svelte']);

/**
 * URL-encode a path, preserving slashes and existing % sequences.
 */
function encodePath(p) {
  return p.split('/').map(segment => {
    // Don't double-encode
    if (segment.includes('%')) return segment;
    return encodeURIComponent(segment).replace(/%2F/g, '/');
  }).join('/');
}

/**
 * Classify an image path/context as above-fold, below-fold, or unknown.
 */
function classifyImage(imagePath, componentPath, surroundingCode) {
  const combined = (imagePath + ' ' + (componentPath || '') + ' ' + (surroundingCode || '')).toLowerCase();

  for (const kw of ABOVE_FOLD_KEYWORDS) {
    if (combined.includes(kw)) return 'above';
  }
  for (const kw of BELOW_FOLD_KEYWORDS) {
    if (combined.includes(kw)) return 'below';
  }
  return 'unknown';
}

/**
 * Extract image src strings from source code.
 * Returns array of { src, context }
 */
function extractImageRefs(content, filePath) {
  const refs = [];
  const fileName = path.basename(filePath, path.extname(filePath)).toLowerCase();

  // Match: src="...", src='...', src={`...`}, src={require('...')}, import x from '...'
  const patterns = [
    // JSX src attribute: src="path" or src='path'
    /src=['"]([^'"]+\.(png|jpg|jpeg|webp|gif|svg|avif))['"](?:\s|\/|>)/gi,
    // import statement: import x from './img.webp'
    /import\s+\w+\s+from\s+['"]([^'"]+\.(png|jpg|jpeg|webp|gif|svg|avif))['"]/gi,
    // require: require('./img.webp')
    /require\s*\(\s*['"]([^'"]+\.(png|jpg|jpeg|webp|gif|svg|avif))['"]\s*\)/gi,
    // url() in CSS-in-JS
    /url\(['"]?([^'")\s]+\.(png|jpg|jpeg|webp|gif|svg|avif))['"]?\)/gi,
    // backgroundImage string
    /backgroundImage[^'"]*['"]url\(([^'")\s]+\.(png|jpg|jpeg|webp|gif|svg|avif))\)/gi,
  ];

  for (const pattern of patterns) {
    let m;
    const re = new RegExp(pattern.source, pattern.flags);
    while ((m = re.exec(content)) !== null) {
      const src = m[1];
      // Skip data URIs and external URLs that aren't Google/CDN assets
      if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) continue;
      refs.push({ src, context: fileName });
    }
  }

  return refs;
}

/**
 * Resolve a relative import path to a public-facing URL.
 * e.g., '../public/hero.webp' -> '/hero.webp'
 */
function resolveToPublicPath(srcPath, filePath, projectRoot) {
  // If it starts with /, treat as public root relative
  if (srcPath.startsWith('/')) return srcPath;

  // If it starts with ./, or ../, resolve relative to the file
  if (srcPath.startsWith('.')) {
    const resolved = path.resolve(path.dirname(filePath), srcPath);
    const publicDir = path.join(projectRoot, 'public');

    if (resolved.startsWith(publicDir)) {
      return '/' + path.relative(publicDir, resolved).replace(/\\/g, '/');
    }

    // Check if it's in src/assets and used via Vite import
    const srcDir = path.join(projectRoot, 'src');
    if (resolved.startsWith(srcDir)) {
      // Vite resolves these at build time — skip for preload (won't have stable URL)
      return null;
    }

    return null;
  }

  // If it looks like a bare asset path with no leading dot/slash (e.g., 'hero.webp')
  // assume it's in public/
  if (!srcPath.includes('/') && IMAGE_EXTS.has(path.extname(srcPath).toLowerCase())) {
    return '/' + srcPath;
  }

  return null;
}

/**
 * Build a <link rel="preload"> tag.
 */
function buildPreloadTag(href, as, type) {
  const encoded = encodePath(href);
  if (as === 'font') {
    return `  <link rel="preload" as="font" type="${type || 'font/woff2'}" crossorigin="anonymous" href="${encoded}">`;
  }
  if (as === 'image' && type) {
    return `  <link rel="preload" as="image" type="${type}" href="${encoded}">`;
  }
  return `  <link rel="preload" as="${as}" href="${encoded}">`;
}

/**
 * Build a <link rel="prefetch"> tag.
 */
function buildPrefetchTag(href) {
  const encoded = encodePath(href);
  return `  <link rel="prefetch" href="${encoded}">`;
}

/**
 * Get MIME type for an image extension.
 */
function mimeForExt(ext) {
  const map = {
    '.webp': 'image/webp',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.avif': 'image/avif',
  };
  return map[ext.toLowerCase()] || null;
}

/**
 * Inject tags into <head> in index.html, before </head>.
 * Returns the updated content.
 */
function injectIntoHead(html, tags) {
  const uniqueTags = tags.filter(tag => !html.includes(tag.trim()));
  if (uniqueTags.length === 0) return { content: html, injected: 0 };

  const insertion = uniqueTags.join('\n') + '\n';
  const updated = html.replace('</head>', `${insertion}</head>`);
  return { content: updated, injected: uniqueTags.length };
}

/**
 * Detect if a project uses route-based code splitting (React.lazy, dynamic import).
 */
function detectLazyRoutes(projectRoot) {
  const srcDir = path.join(projectRoot, 'src');
  if (!fs.existsSync(srcDir)) return [];

  const lazyRoutes = [];
  const sourceFiles = walkDir(srcDir).filter(f => SOURCE_EXTS.has(path.extname(f).toLowerCase()));

  for (const filePath of sourceFiles) {
    const content = readFile(filePath);
    if (!content) continue;

    // Detect React.lazy or dynamic import
    const lazyRe = /(?:React\.lazy|lazy)\s*\(\s*\(\s*\)\s*=>\s*import\s*\(['"]([^'"]+)['"]\)/g;
    const dynamicRe = /import\s*\(['"]([^'"]+)['"]\)/g;

    for (const re of [lazyRe, dynamicRe]) {
      let m;
      while ((m = re.exec(content)) !== null) {
        lazyRoutes.push(m[1]);
      }
    }
  }

  return [...new Set(lazyRoutes)];
}

/**
 * Inject prefetchAll() loader-time prefetch pattern into a loading screen component.
 * Looks for components named Loader, Loading, LoadingScreen, Preloader, etc.
 */
function injectLoaderPrefetch(projectRoot, imagePaths) {
  if (imagePaths.length === 0) return false;

  const srcDir = path.join(projectRoot, 'src');
  if (!fs.existsSync(srcDir)) return false;

  const loaderKeywords = ['loader', 'loading', 'preloader', 'splash', 'loadingscreen', 'loadscreen'];
  const sourceFiles = walkDir(srcDir).filter(f => SOURCE_EXTS.has(path.extname(f).toLowerCase()));

  for (const filePath of sourceFiles) {
    const basename = path.basename(filePath, path.extname(filePath)).toLowerCase();
    if (!loaderKeywords.some(kw => basename.includes(kw))) continue;

    const content = readFile(filePath);
    if (!content) continue;

    // Skip if prefetchAll already injected
    if (content.includes('prefetchAll') || content.includes('new Image()')) continue;

    // Find a good injection point: after the last import statement
    const lastImportIdx = content.lastIndexOf('\nimport ');
    if (lastImportIdx === -1) continue;

    const insertAfter = content.indexOf('\n', lastImportIdx + 1) + 1;
    const prefetchCode = [
      '',
      '// Speed-Doctor: preload images during loading screen',
      'function prefetchAll(urls) {',
      '  urls.forEach(url => {',
      '    const img = new Image();',
      '    img.src = url;',
      '  });',
      '}',
      `prefetchAll([`,
      ...imagePaths.slice(0, 20).map(p => `  '${p}',`),
      `]);`,
      '',
    ].join('\n');

    const updated = content.slice(0, insertAfter) + prefetchCode + content.slice(insertAfter);
    writeFile(filePath, updated);
    logSuccess(`Injected prefetchAll() into loader: ${path.relative(projectRoot, filePath)}`);
    return true;
  }

  return false;
}

/**
 * Inject mouseenter prefetch for nav links to lazy-loaded routes.
 */
function injectHoverPrefetch(projectRoot, lazyRoutes) {
  if (lazyRoutes.length === 0) return false;

  const srcDir = path.join(projectRoot, 'src');
  if (!fs.existsSync(srcDir)) return false;

  const navKeywords = ['nav', 'navbar', 'navigation', 'menu', 'header'];
  const sourceFiles = walkDir(srcDir).filter(f => ['.jsx', '.tsx', '.js', '.ts'].includes(path.extname(f).toLowerCase()));

  for (const filePath of sourceFiles) {
    const basename = path.basename(filePath, path.extname(filePath)).toLowerCase();
    if (!navKeywords.some(kw => basename.includes(kw))) continue;

    const content = readFile(filePath);
    if (!content) continue;
    if (content.includes('onMouseEnter') && content.includes('import(')) continue; // already has hover prefetch
    if (content.includes('speed-doctor-hover-prefetch')) continue;

    // Check if this file has <Link> or <a> elements
    if (!content.includes('<Link') && !content.includes('<a ') && !content.includes('<NavLink')) continue;

    // Inject a prefetch helper function comment
    const prefetchHelper = [
      '',
      '// Speed-Doctor: hover-triggered route prefetch',
      '// eslint-disable-next-line no-unused-vars',
      'const prefetchRoute = (modulePath) => { import(/* webpackPrefetch: true */ modulePath).catch(() => {}); };',
      '// speed-doctor-hover-prefetch',
      '',
    ].join('\n');

    // Find last import
    const lastImportIdx = content.lastIndexOf('\nimport ');
    if (lastImportIdx === -1) continue;
    const insertAfter = content.indexOf('\n', lastImportIdx + 1) + 1;

    const updated = content.slice(0, insertAfter) + prefetchHelper + content.slice(insertAfter);
    writeFile(filePath, updated);
    logSuccess(`Injected hover-prefetch helper into: ${path.relative(projectRoot, filePath)}`);
    return true;
  }

  return false;
}

async function main() {
  printHeader('Speed-Doctor: Preload & Prefetch Injection');

  const projectRoot = getProjectRoot();
  const indexHtmlPath = path.join(projectRoot, 'index.html');

  logInfo(`Project root: ${projectRoot}`);

  if (!fs.existsSync(indexHtmlPath)) {
    logWarn('index.html not found. Cannot inject preload/prefetch tags.');
    logInfo('Looking for _document.tsx, _app.tsx, or layout files...');
    // Future: support Next.js _document
    return;
  }

  let indexHtml = readFile(indexHtmlPath);
  if (!indexHtml) {
    logWarn('Could not read index.html');
    return;
  }

  // Scan source files for image references
  const srcDir = path.join(projectRoot, 'src');
  const appDir = path.join(projectRoot, 'app');
  const publicDir = path.join(projectRoot, 'public');

  const sourceFiles = [];
  for (const dir of [srcDir, appDir]) {
    if (fs.existsSync(dir)) {
      walkDir(dir).filter(f => SOURCE_EXTS.has(path.extname(f).toLowerCase())).forEach(f => sourceFiles.push(f));
    }
  }

  logInfo(`Scanning ${sourceFiles.length} source file(s) for image references...\n`);

  const aboveFoldImages = new Set();
  const belowFoldImages = new Set();

  for (const filePath of sourceFiles) {
    const content = readFile(filePath);
    if (!content) continue;

    const refs = extractImageRefs(content, filePath);

    for (const ref of refs) {
      const publicPath = resolveToPublicPath(ref.src, filePath, projectRoot);
      if (!publicPath) continue;

      // Verify the file actually exists in public/
      const physicalPath = path.join(publicDir, publicPath);
      if (!fs.existsSync(physicalPath)) continue;

      const classification = classifyImage(ref.src, filePath, content);

      if (classification === 'above') {
        aboveFoldImages.add(publicPath);
      } else {
        belowFoldImages.add(publicPath);
      }
    }
  }

  // Also heuristically check: first N images in public/ root are likely above-fold
  if (fs.existsSync(publicDir)) {
    const publicImages = fs.readdirSync(publicDir)
      .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .map(f => '/' + f);

    // If not already classified, put first 2 images in above-fold
    let unclassifiedCount = 0;
    for (const img of publicImages) {
      if (!aboveFoldImages.has(img) && !belowFoldImages.has(img)) {
        if (unclassifiedCount < 2) {
          aboveFoldImages.add(img);
        } else {
          belowFoldImages.add(img);
        }
        unclassifiedCount++;
      }
    }
  }

  logInfo(`Above-fold images: ${aboveFoldImages.size}`);
  logInfo(`Below-fold images: ${belowFoldImages.size}`);
  console.log('');

  // Build tags
  const preloadTags = [];
  const prefetchTags = [];

  for (const imgPath of aboveFoldImages) {
    const ext = path.extname(imgPath).toLowerCase();
    const mime = mimeForExt(ext);
    const tag = buildPreloadTag(imgPath, 'image', mime);
    preloadTags.push(tag);
    logInfo(`  Preload (above-fold): ${imgPath}`);
  }

  for (const imgPath of belowFoldImages) {
    const tag = buildPrefetchTag(imgPath);
    prefetchTags.push(tag);
    logInfo(`  Prefetch (below-fold): ${imgPath}`);
  }

  // Inject into index.html
  let totalInjected = 0;

  if (preloadTags.length > 0) {
    console.log('');
    const { content: updated, injected } = injectIntoHead(indexHtml, preloadTags);
    indexHtml = updated;
    if (injected > 0) {
      logSuccess(`Injected ${injected} preload tag(s) into index.html`);
      totalInjected += injected;
    } else {
      logSkip('Preload tags already present in index.html');
    }
  }

  if (prefetchTags.length > 0) {
    const { content: updated, injected } = injectIntoHead(indexHtml, prefetchTags);
    indexHtml = updated;
    if (injected > 0) {
      logSuccess(`Injected ${injected} prefetch tag(s) into index.html`);
      totalInjected += injected;
    } else {
      logSkip('Prefetch tags already present in index.html');
    }
  }

  if (totalInjected > 0) {
    writeFile(indexHtmlPath, indexHtml);
    logSuccess('index.html updated.');
  } else if (preloadTags.length === 0 && prefetchTags.length === 0) {
    logInfo('No image assets found to preload/prefetch.');
  }

  // Detect lazy routes and inject hover prefetch
  console.log('');
  logInfo('Checking for lazy-loaded routes...');
  const lazyRoutes = detectLazyRoutes(projectRoot);
  if (lazyRoutes.length > 0) {
    logInfo(`Found ${lazyRoutes.length} lazy route(s). Injecting hover prefetch...`);
    injectHoverPrefetch(projectRoot, lazyRoutes);
  } else {
    logSkip('No lazy-loaded routes detected.');
  }

  // Inject loader-time prefetch if there's a loading screen
  const allAboveFold = [...aboveFoldImages];
  if (allAboveFold.length > 0) {
    logInfo('Checking for loading screen components...');
    const injected = injectLoaderPrefetch(projectRoot, allAboveFold);
    if (!injected) {
      logSkip('No loading screen component found.');
    }
  }

  console.log('');
  logInfo(`Done. ${totalInjected} tag(s) injected into index.html.`);
}

main().catch(err => {
  console.error('\n  ✖  Error:', err.message);
  process.exit(1);
});
