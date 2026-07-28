# Optimization Guide

Detailed documentation for each Speed-Doctor optimization pass.

---

## Pass 1: Image Compression & WebP Conversion

**Script:** `scripts/optimize-images.js`  
**Run:** `npm run optimize:images`

### What it does

1. Scans `public/`, `assets/`, and `src/assets/` for `.png`, `.jpg`, `.jpeg` files
2. Converts each to `.webp` using [sharp](https://sharp.pixelplumbing.com/)
3. Uses quality 82 for lossy compression (good balance of size vs. quality)
4. Uses lossless mode for PNG files with alpha transparency
5. Updates all references in `.js`, `.jsx`, `.ts`, `.tsx`, `.html`, `.css` files
6. Preserves original files (safe to verify before deleting)

### Configuration

No configuration needed. The quality value (82) is tuned for most portfolios and product sites. For even smaller files, lower to 75. For higher quality, raise to 90.

To manually adjust:
```js
// In scripts/optimize-images.js, change the quality parameter:
const result = await convertToWebP(imgPath, 85); // default: 82
```

### What it skips

- Files where a newer `.webp` already exists (checks `mtime`)
- Images in `node_modules`, `.git`, `dist`, `build`
- `.gif` files (animation would be lost — use video instead)
- `.svg` files (already vector/text format)

### Expected savings

| Format | Typical Savings |
|--------|----------------|
| JPEG photo | 25–40% smaller |
| PNG with transparency | 30–50% smaller |
| PNG screenshot/diagram | 40–70% smaller |

### Manual cleanup

After verifying the site looks correct with WebP images:
```bash
find public/ -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" | xargs rm
```

---

## Pass 2: Font Self-Hosting

**Script:** `scripts/optimize-fonts.js`  
**Run:** `npm run optimize:fonts`

### What it does

1. Scans CSS files for `@import url("https://fonts.googleapis.com/...")` 
2. Fetches the font CSS from Google Fonts API (spoofing modern browser UA to get woff2)
3. Downloads each `.woff2` file to `public/fonts/`
4. Replaces the `@import` with local `@font-face` rules using `font-display: block`
5. Injects `<link rel="preload" as="font">` tags into `index.html` for critical weights (400, 700)

### Why this matters

External font loading adds 2–4 network round-trips:
1. DNS lookup for `fonts.googleapis.com`
2. Fetch of the font CSS
3. DNS lookup for `fonts.gstatic.com`  
4. Fetch of each font file

Self-hosting eliminates all of these after the first visit (cached locally).

### Font display strategy

Speed-Doctor uses `font-display: block` which:
- Renders an invisible placeholder for up to 3 seconds while fonts load
- Swaps to the custom font when ready
- Prevents FOUT (Flash of Unstyled Text) at the cost of brief invisible text

If you prefer FOUT over invisible text, change to `font-display: swap` in the generated `@font-face` rules.

### Supported providers

- Google Fonts (`fonts.googleapis.com`)
- Direct `.woff2` URLs in `@font-face` `src:` declarations

Not yet supported:
- Adobe Fonts (Typekit) — requires authentication
- Bunny Fonts — similar API to Google Fonts (PRs welcome)

---

## Pass 3: Preload & Prefetch Injection

**Script:** `scripts/optimize-preload.js`  
**Run:** `npm run optimize:preload`

### What it does

1. Scans source files (`src/`, `app/`) for image references
2. Classifies images as above-fold or below-fold using heuristics
3. Injects `<link rel="preload" as="image">` for above-fold images
4. Injects `<link rel="prefetch">` for below-fold images
5. Detects lazy-loaded routes and injects hover-prefetch helpers
6. Detects loading screen components and injects `prefetchAll()` patterns

### Heuristics for above-fold detection

A component is classified as above-fold if any of these match:
- File/directory name contains: `hero`, `banner`, `cover`, `landing`, `splash`, `jumbotron`
- File/directory name contains: `nav`, `navbar`, `navigation`, `header`
- File is an entry point: `App.jsx`, `index.jsx`, `main.jsx`, `page.tsx`
- CSS class names in the component contain above-fold keywords

### Why preload matters

Without preload, the browser discovers images only after parsing HTML and executing JavaScript. Preloading fetches them in parallel with HTML parsing, reducing LCP by 200–500ms on average.

### Idempotency

The script checks if each `href` is already present before injecting. Safe to run multiple times.

---

## Pass 4: Lazy Loading Audit

**Script:** `scripts/optimize-lazy.js`  
**Run:** `npm run optimize:lazy`

### What it does

1. Scans all JSX/TSX/HTML for `loading="lazy"` on `<img>` tags
2. Checks if the image is in an above-fold component (same heuristics as Pass 3)
3. Upgrades above-fold lazy images: `loading="lazy"` → `loading="eager" fetchpriority="high"`
4. Keeps `loading="lazy"` for below-fold images (correct behavior)

### Why this matters

`loading="lazy"` tells the browser to defer fetching the image until it's near the viewport. For a hero image that is *always* visible on load, this is a bug — it delays the LCP element unnecessarily.

`fetchpriority="high"` goes further: it tells the browser's preload scanner to prioritize this image over other in-flight requests.

### What it keeps

- `loading="lazy"` on images in card grids, galleries, portfolios, footers
- All below-fold content remains correctly lazy-loaded

---

## Pass 5: Scrollbar Stability

**Script:** `scripts/optimize-scrollbar.js`  
**Run:** `npm run optimize:scrollbar`

### What it does

Finds your global CSS file and adds:

```css
html {
  overflow-y: scroll;
  scrollbar-gutter: stable;
}
```

### Why this matters

When a page transitions from less-than-viewport-height content (no scrollbar) to more (scrollbar appears), the scrollbar pushes content left, causing a layout shift. This is one of the most common CLS sources.

`scrollbar-gutter: stable` reserves space for the scrollbar even when it's not visible, preventing the shift.

`overflow-y: scroll` forces the scrollbar to always be present (but may show a disabled/empty scrollbar on short pages — visually identical in modern browsers).

### Browser support

`scrollbar-gutter` is supported in all modern browsers (Chrome 94+, Firefox 97+, Safari 15.4+). It degrades gracefully — older browsers simply ignore it with no visual change.

---

## Smooth Experience Playbook

These are manual checks and implementation patterns for cases where metrics look acceptable
but the experience still feels late, jumpy, or unfinished in a cold browser.

### Cold-route media readiness

Use one route asset manifest for:

1. Direct URL visits
2. Loader-time prefetch
3. Hover/touch route prefetch
4. In-route scroll/reveal sections

For each route-critical image:

```js
function preloadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = async () => {
      try {
        if (img.decode) await img.decode();
      } catch {}
      resolve();
    };
    img.src = src;
  });
}
```

The goal is not to delay the page unnecessarily. The goal is to start image-heavy motion
only after the assets that motion exposes are already discovered and decoded.

### Horizontal mockup strips

Phone mockup strips often fail on cold load because the first few screenshots appear, while
off-canvas screens reveal as empty device shells when the user scrolls sideways.

Fix pattern:

- Treat every strip screenshot as near-critical, not lazy.
- Preload and decode all strip images at route entry.
- Use `loading="eager"` for the strip images.
- Keep exact `width`, `height`, or `aspect-ratio` on the mockup frame.
- Do not change the carousel timing, snapping, or reveal easing just to hide loading.

Verification:

- Open the route in an incognito browser.
- Immediately scroll to the strip.
- Drag horizontally before waiting.
- Confirm every phone frame already contains its screenshot.

### Moving photography, music, and marquee sections

Do not lazy-load assets inside moving tracks. A moving track exposes images faster than normal
viewport heuristics can discover them.

Fix pattern:

- Remove lazy loading from moving-track images.
- Preload and decode all desktop and mobile track assets before the track starts.
- Share the same preloader across loader navigation, route prefetch, and direct visits.
- Reserve image dimensions so there is no tile jump after decode.

### Critical icons and nav reveal

Icons inside buttons, chips, and nav controls are part of the first impression. On cold cache,
they can appear after the button animation if they are discovered too late.

Fix pattern:

- Inline critical SVG icons or import them statically.
- Preload icon assets used by above-fold nav buttons.
- Start nav reveal after critical icon discovery where possible.
- For mobile sticky nav state changes, transition background, padding, and transform together
  instead of snapping between states.

### Route transition flash

If navigation briefly shows a dark or wrong-colored surface before the destination page:

- Put the destination background on the route shell before the transition starts.
- Avoid dark fallback wrappers for light routes.
- Use the same background path for direct visits, loader navigation, and hover-prefetched visits.

### Reveal animation guardrail

When the issue is late content, do not solve it with a fade that hides missing assets.
Use this sequence:

1. Reserve layout space.
2. Preload and decode route-critical assets.
3. Reveal from below at full opacity.
4. Keep existing timing and easing unless the user explicitly asks to change animation.

---

## Estimated Performance Impact

Based on real-world measurements across Vite/React portfolio sites:

| Optimization | LCP Impact | CLS Impact | FCP Impact |
|---|---|---|---|
| WebP images | -15–30% | None | -5–15% |
| Font self-hosting | -10–20% | -5–15% | -15–25% |
| Critical preloads | -20–40% | None | -10–20% |
| Lazy→Eager fix | -10–25% | None | None |
| Scrollbar gutter | None | -100% (for that source) | None |

Results vary based on image sizes, network conditions, and server response time.
