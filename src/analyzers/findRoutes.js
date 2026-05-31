'use strict';

/**
 * findRoutes.js
 *
 * Detects route-based code splitting in a project.
 * Looks for:
 *   - React.lazy(() => import('./Page'))
 *   - const Page = lazy(() => import('./Page'))
 *   - Dynamic import() calls in route files
 *   - Next.js dynamic() imports
 *   - React Router v6 lazy routes
 *   - Vite's defineAsyncComponent (Vue)
 *
 * Returns structured data about lazy-loaded routes for hover-prefetch injection.
 */

const fs = require('fs');
const path = require('path');
const { walkDir } = require('./findImages');

const SOURCE_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte']);

/**
 * @typedef {Object} LazyRoute
 * @property {string} importPath - The dynamic import path string
 * @property {string} sourceFile - File where the lazy import was found
 * @property {string} type - 'react-lazy' | 'dynamic-import' | 'next-dynamic' | 'vue-async'
 * @property {number} line - Line number
 */

/**
 * Extract all lazy/dynamic route imports from a source file.
 * @param {string} content
 * @param {string} filePath
 * @returns {LazyRoute[]}
 */
function extractLazyImports(content, filePath) {
  const routes = [];
  const lines = content.split('\n');

  lines.forEach((line, i) => {
    const lineNum = i + 1;

    // React.lazy(() => import('./Component'))
    // const X = lazy(() => import('./Component'))
    const reactLazyRe = /(?:React\.lazy|(?<!\w)lazy)\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    let m;
    while ((m = reactLazyRe.exec(line)) !== null) {
      routes.push({
        importPath: m[1],
        sourceFile: filePath,
        type: 'react-lazy',
        line: lineNum,
      });
    }

    // Next.js: dynamic(() => import('./Component'))
    const nextDynamicRe = /dynamic\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    while ((m = nextDynamicRe.exec(line)) !== null) {
      routes.push({
        importPath: m[1],
        sourceFile: filePath,
        type: 'next-dynamic',
        line: lineNum,
      });
    }

    // Generic dynamic import in router context: import('./Page')
    // Only pick up imports in route/router files
    const basename = path.basename(filePath, path.extname(filePath)).toLowerCase();
    const isRouteFile = ['router', 'routes', 'routing', 'app', 'index'].some(kw => basename.includes(kw));

    if (isRouteFile) {
      const dynamicRe = /(?<!static\s)import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
      while ((m = dynamicRe.exec(line)) !== null) {
        // Skip imports that are already captured by react-lazy pattern
        const alreadyCaptured = routes.some(r => r.importPath === m[1] && r.line === lineNum);
        if (!alreadyCaptured) {
          routes.push({
            importPath: m[1],
            sourceFile: filePath,
            type: 'dynamic-import',
            line: lineNum,
          });
        }
      }
    }

    // Vue defineAsyncComponent
    const vueAsyncRe = /defineAsyncComponent\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    while ((m = vueAsyncRe.exec(line)) !== null) {
      routes.push({
        importPath: m[1],
        sourceFile: filePath,
        type: 'vue-async',
        line: lineNum,
      });
    }
  });

  return routes;
}

/**
 * Find all lazy-loaded routes in a project.
 *
 * @param {string} projectRoot
 * @returns {LazyRoute[]}
 */
function findRoutes(projectRoot) {
  const srcDir = path.join(projectRoot, 'src');
  const appDir = path.join(projectRoot, 'app');
  const pagesDir = path.join(projectRoot, 'pages');

  const sourceFiles = [];
  for (const dir of [srcDir, appDir, pagesDir]) {
    if (fs.existsSync(dir)) {
      walkDir(dir)
        .filter(f => SOURCE_EXTS.has(path.extname(f).toLowerCase()))
        .forEach(f => sourceFiles.push(f));
    }
  }

  const allRoutes = [];
  const seen = new Set();

  for (const filePath of sourceFiles) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const routes = extractLazyImports(content, filePath);
    routes.forEach(r => {
      const key = `${r.importPath}:${r.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        allRoutes.push(r);
      }
    });
  }

  return allRoutes;
}

/**
 * Check if a project uses any form of code splitting.
 * @param {string} projectRoot
 * @returns {boolean}
 */
function hasCodeSplitting(projectRoot) {
  return findRoutes(projectRoot).length > 0;
}

module.exports = { findRoutes, hasCodeSplitting, extractLazyImports };
