'use strict';

/**
 * htmlUtils.js
 *
 * Utilities for parsing and modifying HTML files without a full DOM parser.
 * Uses regex-based manipulation suitable for index.html in Vite/React projects.
 */

const path = require('path');
const { encodeAssetPath } = require('./encodeUtils');

/**
 * Check if an HTML string already contains a specific tag (by partial match).
 * @param {string} html
 * @param {string} tagFragment - A substring to check for, e.g. 'rel="preload"'
 * @returns {boolean}
 */
function hasTag(html, tagFragment) {
  return html.includes(tagFragment);
}

/**
 * Check if a <link> tag with a specific href already exists.
 * @param {string} html
 * @param {string} href
 * @returns {boolean}
 */
function hasLinkWithHref(html, href) {
  // Check both the raw and encoded versions
  const encoded = encodeAssetPath(href);
  return html.includes(`href="${href}"`) ||
         html.includes(`href='${href}'`) ||
         html.includes(`href="${encoded}"`) ||
         html.includes(`href='${encoded}'`);
}

/**
 * Build a <link rel="preload" as="image"> tag.
 * @param {string} href - Public path like '/hero.webp'
 * @param {string} [mimeType] - Optional MIME type like 'image/webp'
 * @returns {string}
 */
function buildPreloadImageTag(href, mimeType) {
  const encoded = encodeAssetPath(href);
  if (mimeType) {
    return `  <link rel="preload" as="image" type="${mimeType}" href="${encoded}">`;
  }
  return `  <link rel="preload" as="image" href="${encoded}">`;
}

/**
 * Build a <link rel="prefetch"> tag.
 * @param {string} href
 * @returns {string}
 */
function buildPrefetchTag(href) {
  const encoded = encodeAssetPath(href);
  return `  <link rel="prefetch" href="${encoded}">`;
}

/**
 * Build a <link rel="preload" as="font"> tag.
 * @param {string} href - Path to the font file
 * @param {string} [fontType] - e.g. 'font/woff2'
 * @returns {string}
 */
function buildPreloadFontTag(href, fontType = 'font/woff2') {
  const encoded = encodeAssetPath(href);
  return `  <link rel="preload" as="font" type="${fontType}" crossorigin="anonymous" href="${encoded}">`;
}

/**
 * Build a <link rel="preconnect"> tag.
 * @param {string} origin - e.g. 'https://fonts.googleapis.com'
 * @param {boolean} [crossorigin]
 * @returns {string}
 */
function buildPreconnectTag(origin, crossorigin = false) {
  return crossorigin
    ? `  <link rel="preconnect" href="${origin}" crossorigin>`
    : `  <link rel="preconnect" href="${origin}">`;
}

/**
 * Inject an array of tag strings into <head>, just before </head>.
 * Deduplicates — won't add a tag if the same href/content is already present.
 *
 * @param {string} html - Full HTML content
 * @param {string[]} tags - Array of tag strings to inject
 * @returns {{ content: string, injected: number }}
 */
function injectIntoHead(html, tags) {
  const uniqueTags = tags.filter(tag => {
    // Extract href from tag to check for duplicates
    const hrefMatch = /href=["']([^"']+)["']/.exec(tag);
    if (hrefMatch) {
      return !hasLinkWithHref(html, hrefMatch[1]);
    }
    return !html.includes(tag.trim());
  });

  if (uniqueTags.length === 0) return { content: html, injected: 0 };

  const insertion = uniqueTags.join('\n') + '\n';
  const updated = html.replace('</head>', `${insertion}</head>`);

  return { content: updated, injected: uniqueTags.length };
}

/**
 * Extract the value of a specific meta tag.
 * @param {string} html
 * @param {string} name - The meta name or property
 * @returns {string|null}
 */
function getMetaContent(html, name) {
  const re = new RegExp(`<meta\\s+(?:name|property)=["']${name}["']\\s+content=["']([^"']+)["']`, 'i');
  const m = re.exec(html);
  return m ? m[1] : null;
}

/**
 * Get the MIME type for an image extension.
 * @param {string} ext - File extension like '.webp'
 * @returns {string|null}
 */
function imageExtToMime(ext) {
  const map = {
    '.webp':  'image/webp',
    '.png':   'image/png',
    '.jpg':   'image/jpeg',
    '.jpeg':  'image/jpeg',
    '.gif':   'image/gif',
    '.svg':   'image/svg+xml',
    '.avif':  'image/avif',
  };
  return map[ext.toLowerCase()] || null;
}

/**
 * Remove <link> tags referencing Google Fonts from HTML.
 * @param {string} html
 * @returns {string}
 */
function removeGoogleFontsLinks(html) {
  return html.replace(
    /<link[^>]+href=["'][^"']*fonts\.googleapis\.com[^"']*["'][^>]*>\s*/gi,
    ''
  );
}

module.exports = {
  hasTag,
  hasLinkWithHref,
  buildPreloadImageTag,
  buildPrefetchTag,
  buildPreloadFontTag,
  buildPreconnectTag,
  injectIntoHead,
  getMetaContent,
  imageExtToMime,
  removeGoogleFontsLinks,
};
