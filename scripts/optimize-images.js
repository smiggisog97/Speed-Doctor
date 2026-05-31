#!/usr/bin/env node
/**
 * optimize-images.js
 *
 * Converts PNG/JPG/JPEG images in `public/` to WebP format using Sharp,
 * then updates all src references in JS/JSX/TSX/HTML/CSS source files.
 *
 * Usage:
 *   node scripts/optimize-images.js [--dir /path/to/project]
 *   npm run optimize:images
 *
 * Options:
 *   --dir   Project root directory (defaults to cwd)
 *
 * What it does:
 *   1. Scans <root>/public/ recursively for .png, .jpg, .jpeg files
 *   2. Converts each to WebP at quality 80 (lossless where transparency needed)
 *   3. Writes the .webp file alongside the original
 *   4. Updates all references in source files (JS/JSX/TSX/HTML/CSS)
 *   5. Skips files that are already converted (idempotent)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getProjectRoot, walkDir, readFile, writeFile, printHeader, logSuccess, logInfo, logSkip, logWarn } = require('./utils');

// Source file extensions to scan for image references
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.scss', '.sass', '.vue', '.svelte']);

// Image extensions to convert
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

/**
 * Convert a single image file to WebP.
 * Returns the output path, or null if skipped.
 */
async function convertToWebP(inputPath, quality = 82) {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    throw new Error('sharp is not installed. Run: npm install sharp');
  }

  const ext = path.extname(inputPath).toLowerCase();
  const outputPath = inputPath.replace(/\.(png|jpg|jpeg)$/i, '.webp');

  // Skip if WebP already exists and is newer than source
  if (fs.existsSync(outputPath)) {
    const srcStat = fs.statSync(inputPath);
    const dstStat = fs.statSync(outputPath);
    if (dstStat.mtimeMs >= srcStat.mtimeMs) {
      return null; // already up-to-date
    }
  }

  const image = sharp(inputPath);
  const meta = await image.metadata();

  // Use lossless for PNG with alpha channel; lossy otherwise
  const hasAlpha = meta.channels === 4 || (meta.hasAlpha === true);
  const isLossless = ext === '.png' && hasAlpha;

  if (isLossless) {
    await image.webp({ lossless: true }).toFile(outputPath);
  } else {
    await image.webp({ quality }).toFile(outputPath);
  }

  return outputPath;
}

/**
 * Update image references in a source file.
 * Returns true if the file was modified.
 */
function updateReferences(filePath, conversions) {
  let content = readFile(filePath);
  if (!content) return false;

  const original = content;

  for (const [oldBasename, newBasename] of conversions) {
    // Match the basename in string literals or attribute values, with optional path prefix
    // Covers: "photo.png", 'photo.png', url(photo.png), src="photo.png"
    const escaped = oldBasename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<=['"(\`/])${escaped}(?=['");\`])`, 'g');
    content = content.replace(pattern, newBasename);

    // Also handle bare references like: import img from './photo.png'
    const importPattern = new RegExp(
      `((?:import|require)[^'"]*['"\`][^'"\`]*)${escaped}(['"\`])`,
      'g'
    );
    content = content.replace(importPattern, `$1${newBasename}$2`);
  }

  if (content !== original) {
    writeFile(filePath, content);
    return true;
  }
  return false;
}

async function main() {
  printHeader('Speed-Doctor: Image Compression & WebP Conversion');

  const projectRoot = getProjectRoot();
  const publicDir = path.join(projectRoot, 'public');
  const srcDirs = ['src', 'app', 'pages', 'components'].map(d => path.join(projectRoot, d));

  logInfo(`Project root: ${projectRoot}`);
  logInfo(`Scanning:     ${publicDir}`);

  if (!fs.existsSync(publicDir)) {
    logWarn(`public/ directory not found at ${publicDir}`);
    logInfo('Scanning project root for images instead...');
  }

  // 1. Find all images to convert
  const scanRoot = fs.existsSync(publicDir) ? publicDir : projectRoot;
  const allFiles = walkDir(scanRoot);
  const imagesToConvert = allFiles.filter(f => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()));

  if (imagesToConvert.length === 0) {
    logInfo('No PNG/JPG/JPEG images found. Nothing to convert.');
    return;
  }

  logInfo(`Found ${imagesToConvert.length} image(s) to process.\n`);

  // 2. Convert images
  const conversions = new Map(); // basename.ext -> basename.webp
  let converted = 0;
  let skipped = 0;

  for (const imgPath of imagesToConvert) {
    const basename = path.basename(imgPath);
    const webpBasename = basename.replace(/\.(png|jpg|jpeg)$/i, '.webp');

    try {
      const result = await convertToWebP(imgPath);
      if (result) {
        logSuccess(`Converted: ${path.relative(projectRoot, imgPath)} → ${webpBasename}`);
        conversions.set(basename, webpBasename);
        converted++;
      } else {
        logSkip(`Up-to-date: ${path.relative(projectRoot, imgPath)}`);
        // Still register conversion so references get updated
        conversions.set(basename, webpBasename);
        skipped++;
      }
    } catch (err) {
      logWarn(`Failed to convert ${basename}: ${err.message}`);
    }
  }

  console.log('');
  logInfo(`Converted: ${converted}  |  Already up-to-date: ${skipped}`);

  if (conversions.size === 0) {
    logInfo('No conversions performed. Skipping reference update.');
    return;
  }

  // 3. Update references in source files
  console.log('');
  logInfo('Updating image references in source files...\n');

  // Scan src/, app/, pages/, components/, plus index.html at root
  const sourceFiles = [];
  const indexHtml = path.join(projectRoot, 'index.html');
  if (fs.existsSync(indexHtml)) sourceFiles.push(indexHtml);

  for (const dir of srcDirs) {
    if (fs.existsSync(dir)) {
      walkDir(dir).forEach(f => {
        if (SOURCE_EXTENSIONS.has(path.extname(f).toLowerCase())) {
          sourceFiles.push(f);
        }
      });
    }
  }

  // Also scan root-level JS/HTML files
  for (const entry of fs.readdirSync(projectRoot, { withFileTypes: true })) {
    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      const fp = path.join(projectRoot, entry.name);
      if (!sourceFiles.includes(fp)) sourceFiles.push(fp);
    }
  }

  let updatedFiles = 0;
  for (const filePath of sourceFiles) {
    if (updateReferences(filePath, conversions)) {
      logSuccess(`Updated refs: ${path.relative(projectRoot, filePath)}`);
      updatedFiles++;
    }
  }

  if (updatedFiles === 0) {
    logInfo('No source file references needed updating.');
  }

  console.log('');
  logInfo(`Done. Converted ${converted} image(s), updated ${updatedFiles} source file(s).`);
  console.log('');
  logInfo('Note: Original images are preserved. Remove them manually once verified.');
}

main().catch(err => {
  console.error('\n  ✖  Error:', err.message);
  process.exit(1);
});
