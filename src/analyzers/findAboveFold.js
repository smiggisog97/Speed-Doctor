'use strict';

/**
 * findAboveFold.js
 *
 * Detects above-fold assets using heuristics:
 *   - Component file name/path contains hero, banner, cover, header, landing, etc.
 *   - CSS class names in the component contain above-fold keywords
 *   - First image in the component tree (App.jsx, index.jsx, main page component)
 *   - Images in navigation components
 *
 * Returns an array of asset paths likely visible in the initial viewport.
 */

const fs = require('fs');
const path = require('path');
const { walkDir } = require('./findImages');

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif']);
const SOURCE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.html', '.vue', '.svelte']);

// Component names or paths that strongly suggest above-the-fold placement
const ABOVE_FOLD_STRONG = [
  'hero', 'banner', 'cover', 'landing', 'splash',
  'jumbotron', 'masthead', 'above-fold', 'abovefold',
  'first-section', 'firstsection',
];

// Component names that suggest navigation (logo is above fold)
const NAV_KEYWORDS = ['nav', 'navbar', 'navigation', 'header', 'topbar', 'menubar'];

// Keywords that suggest below-fold (used to exclude false positives)
const BELOW_FOLD_STRONG = [
  'footer', 'testimonial', 'contact', 'faq', 'accordion',
  'blog', 'news', 'archive', 'pagination',
];

// CSS class patterns that suggest above-fold
const ABOVE_FOLD_CLASS_RE = /(?:class|className)=["'`][^"'`]*(hero|banner|cover|jumbotron|above-fold|masthead)[^"'`]*["'`]/gi;

/**
 * Extract image src values from a source file.
 * @param {string} content
 * @returns {string[]}
 */
function extractImageSrcs(content) {
  const srcs = [];

  const patterns = [
    /src=["']([^'"]+\.(png|jpg|jpeg|webp|gif|svg|avif))["']/gi,
    /src=\{["'`]([^"'`]+\.(png|jpg|jpeg|webp|gif|svg|avif))["'`]\}/gi,
    /import\s+\w+\s+from\s+["']([^"']+\.(png|jpg|jpeg|webp|gif|svg|avif))["']/gi,
    /require\s*\(\s*["']([^"']+\.(png|jpg|jpeg|webp|gif|svg|avif))["']\s*\)/gi,
    /backgroundImage[^"']*["']url\(([^"')]+\.(png|jpg|jpeg|webp|gif|svg|avif))\)/gi,
    /url\(["']?([^"')]+\.(png|jpg|jpeg|webp|gif|svg|avif))["']?\)/gi,
  ];

  for (const re of patterns) {
    let m;
    const pattern = new RegExp(re.source, re.flags);
    while ((m = pattern.exec(content)) !== null) {
      const src = m[1];
      if (!src.startsWith('data:') && !src.startsWith('http')) {
        srcs.push(src);
      }
    }
  }

  return [...new Set(srcs)];
}

/**
 * Classify whether a file is likely above-fold.
 * @param {string} filePath
 * @param {string} content
 * @returns {'above' | 'below' | 'nav' | 'unknown'}
 */
function classifyFile(filePath, content) {
  const lower = filePath.toLowerCase();
  const baseName = path.basename(filePath, path.extname(filePath)).toLowerCase();

  if (BELOW_FOLD_STRONG.some(kw => baseName.includes(kw))) return 'below';

  if (ABOVE_FOLD_STRONG.some(kw => lower.includes(kw))) return 'above';
  if (NAV_KEYWORDS.some(kw => baseName.includes(kw))) return 'nav';

  // Check CSS class names in the content
  if (ABOVE_FOLD_CLASS_RE.test(content)) {
    ABOVE_FOLD_CLASS_RE.lastIndex = 0; // reset regex state
    return 'above';
  }
  ABOVE_FOLD_CLASS_RE.lastIndex = 0;

  // Entry-point files — first image is likely above fold
  const entryPatterns = ['app', 'index', 'main', 'root', 'page'];
  if (entryPatterns.some(p => baseName === p || baseName.startsWith(p + '.'))) {
    return 'above';
  }

  return 'unknown';
}

/**
 * Resolve a relative import path to a public-facing URL path.
 * @param {string} srcRef - The import path from the source file
 * @param {string} filePath - The source file that contains the reference
 * @param {string} projectRoot
 * @returns {string|null} - Public URL path like '/hero.webp', or null
 */
function resolveToPublicPath(srcRef, filePath, projectRoot) {
  if (srcRef.startsWith('/')) return srcRef;

  if (srcRef.startsWith('.')) {
    const resolved = path.resolve(path.dirname(filePath), srcRef);
    const publicDir = path.join(projectRoot, 'public');

    if (resolved.startsWith(publicDir)) {
      return '/' + path.relative(publicDir, resolved).replace(/\\/g, '/');
    }
    return null; // src/assets — resolved at build time, no stable URL
  }

  // Bare filename — assume public/
  if (IMAGE_EXTS.has(path.extname(srcRef).toLowerCase())) {
    return '/' + srcRef;
  }

  return null;
}

/**
 * Find all above-fold asset paths in a project.
 *
 * @param {string} projectRoot
 * @returns {{ above: string[], below: string[], unknown: string[] }}
 */
function findAboveFoldAssets(projectRoot) {
  const srcDir = path.join(projectRoot, 'src');
  const appDir = path.join(projectRoot, 'app');
  const publicDir = path.join(projectRoot, 'public');

  const sourceFiles = [];
  for (const dir of [srcDir, appDir]) {
    if (fs.existsSync(dir)) {
      walkDir(dir)
        .filter(f => SOURCE_EXTS.has(path.extname(f).toLowerCase()))
        .forEach(f => sourceFiles.push(f));
    }
  }

  const above = new Set();
  const below = new Set();
  const unknown = new Set();

  for (const filePath of sourceFiles) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const classification = classifyFile(filePath, content);
    if (classification === 'below') continue;

    const srcs = extractImageSrcs(content);
    for (const src of srcs) {
      const publicPath = resolveToPublicPath(src, filePath, projectRoot);
      if (!publicPath) continue;

      // Verify file exists
      const physPath = path.join(publicDir, publicPath);
      if (!fs.existsSync(physPath)) continue;

      if (classification === 'above' || classification === 'nav') {
        above.add(publicPath);
      } else {
        unknown.add(publicPath);
      }
    }
  }

  // Anything in 'unknown' but not 'above' goes to below
  for (const p of unknown) {
    if (!above.has(p)) below.add(p);
  }

  return {
    above: [...above],
    below: [...below],
    unknown: [],
  };
}

module.exports = { findAboveFoldAssets, classifyFile, resolveToPublicPath };
