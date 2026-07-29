# Speed-Doctor v1.2.0

Autonomous website performance optimizer. Analyzes and improves first-load performance, Core Web Vitals, animation smoothness, and perceived speed — without touching your design, layout, or code logic.

## What It Does

Speed-Doctor runs 8 automated passes on your project:

| Pass | What It Does | Metric Improved |
|------|-------------|----------------|
| **Images** | Converts PNG/JPG → WebP (quality 82), updates all references | LCP, Total Bytes |
| **Fonts** | Self-hosts Google Fonts in `public/fonts/`, eliminates CDN round-trips | FCP, LCP |
| **Preload** | Injects `<link rel="preload">` for above-fold assets, `<link rel="prefetch">` for below-fold | LCP |
| **Lazy Audit** | Upgrades `loading="lazy"` → `loading="eager" fetchpriority="high"` on hero images | LCP |
| **Decoding** | Adds `decoding="async"` to below-fold images — decode off main thread | Scroll jank |
| **Motion** | Adds a `prefers-reduced-motion` CSS guard for the user's explicit accessibility preference | Accessibility |
| **RAF Audit** | Flags `requestAnimationFrame` loops without time-delta guards (report only) | 120Hz runaway bug |
| **Device Audit** | Flags reduced-motion layout traps, disabled interaction, uncapped canvas DPR, missing WebGL fallback, and image-priority floods (report only) | Cross-device resilience |

## Install

```bash
git clone https://github.com/smiggisog97/Speed-Doctor
cd Speed-Doctor
npm install
```

## Run

```bash
# Run all passes against the current directory
npm run speed-doctor

# Run against a specific project
node scripts/index.js --dir /path/to/your/project

# Run individual passes
npm run optimize:images
npm run optimize:fonts
npm run optimize:preload
npm run optimize:lazy
npm run optimize:decoding
npm run optimize:motion
npm run audit:raf
npm run audit:device
npm run report
```

After running, review `OPTIMIZATION_REPORT.md` in your project root.

## Before / After Example

A real-world Vite + React portfolio site:

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| LCP | 3.2s | 1.8s | −44% |
| Total image weight | 2.1 MB | 0.9 MB | −57% |
| Font requests | 4 external | 0 external | −100% |
| Scroll jank | Visible | None | Fixed |
| Lighthouse Performance | 62 | 91 | +29pts |

*Results vary. Run Lighthouse before and after to measure your specific improvement.*

## Framework Support

| Framework | Images | Fonts | Preload | Lazy | Decoding | Motion |
|-----------|--------|-------|---------|------|----------|--------|
| Vite + React | Full | Full | Full | Full | Full | Full |
| Vite + Vue 3 | Full | Full | Full | Partial | Full | Full |
| Create React App | Full | Full | Full | Full | Full | Full |
| Next.js 13/14 | Full | Full | Partial | Partial | Full | Full |
| Astro | Full | Full | Partial | Partial | Full | Full |
| SvelteKit | Full | Full | Partial | Partial | Full | Full |
| Plain HTML/CSS | Full | Full | Full | Full | Full | Full |

See [docs/framework-support.md](docs/framework-support.md) for framework-specific notes.

## All Optimizations

### Image WebP Conversion
- Scans `public/`, `assets/`, `src/assets/` for PNG/JPG/JPEG
- Converts to WebP at quality 82 (lossless for PNGs with alpha)
- Skips files where a newer WebP already exists
- Updates all references in `.jsx`, `.tsx`, `.js`, `.ts`, `.html`, `.css` files
- Preserves originals for safety

### Font Self-Hosting
- Detects `@import url("fonts.googleapis.com/...")` in CSS files
- Downloads the woff2 font files to `public/fonts/`
- Replaces the `@import` with local `@font-face` rules
- Adds `font-display: block` to prevent invisible text flash
- Injects `<link rel="preload" as="font">` for critical weights into `index.html`

### Critical Asset Preloading
- Analyzes source files for image references
- Classifies assets as above-fold or below-fold (heuristic: component/class names)
- Injects `<link rel="preload" as="image">` for above-fold assets
- Injects `<link rel="prefetch">` for below-fold assets
- Fully idempotent — never adds duplicate tags

### Lazy Loading Audit
- Scans JSX/TSX/HTML for `loading="lazy"` on `<img>` tags
- Uses heuristics to identify above-fold images (hero, banner, nav logo)
- Upgrades them to `loading="eager" fetchpriority="high"`
- Preserves `loading="lazy"` on cards, galleries, and other below-fold content

### Image Decoding (async)
- Adds `decoding="async"` to below-fold lazy-loaded images
- Browser decodes images off the main thread — reduces jank during scroll
- Skips above-fold/hero images (synchronous decode is better for LCP there)
- Idempotent — skips images that already have a `decoding` attribute

### Reduced-Motion Safety Net
- Appends a `@media (prefers-reduced-motion: reduce)` block to global CSS
- Disables all animations/transitions for users who opted into reduced motion (OS setting)
- Respects the explicit reduced-motion accessibility preference; it is not used as a device-power detector
- Zero impact on normal users — pure media-query gate
- Idempotent — skips if guard already present

### RAF Rate-Independence Audit (report only)
- Scans JS/TS files for `requestAnimationFrame` loops without a time-delta guard
- Flags the 120Hz runaway bug: animations that move things by a fixed amount per frame run 2× faster on 120Hz displays
- **Never modifies source files** — outputs file + line numbers for manual review
- Fix pattern (see below)

### Device Compatibility Audit (report only)
- Flags `transform: none !important` inside reduced-motion media queries because transform-positioned UI can collapse to its DOM origin
- Flags reduced-motion checks coupled to pointer or drag handlers so direct interactions keep a usable fallback
- Flags uncapped canvas DPR, missing WebGL context-loss handling, and large eager/high-priority image batches
- Never guesses that a device is "weak" from its model, screen size, or user agent
- Never modifies source files; reproduce and measure in the affected browser before fixing

### Smooth Experience Playbook
- Documents cold-cache fixes for late image appearance in moving tracks, carousels, and phone mockup strips
- Covers route-level preload/decode, direct visits, loader navigation, and hover-prefetch paths
- Includes first-load nav icon readiness and route transition flash checks
- Keeps animation timing and visual design unchanged while fixing asset readiness

#### The 120Hz Runaway Bug — Fix Pattern

```js
const STEP = 1000 / 60; // 16.67ms — one 60Hz frame
let lastUpdate = performance.now();

function draw() {
  const now = performance.now();
  let elapsed = now - lastUpdate;
  if (elapsed > 250) elapsed = STEP; // guard: tab was backgrounded
  const steps = Math.floor(elapsed / STEP);
  if (steps > 0) { lastUpdate += steps * STEP; simulate(steps); }
  requestAnimationFrame(draw);
}
```

## Safety

Speed-Doctor is designed to be safe by default. It:

- **Never** modifies CSS spacing, colors, typography, or animations
- **Never** changes component structure or layout
- **Never** touches business logic or state management
- **Never** modifies Framer Motion, GSAP, or other animation configs
- **Always** preserves original image files
- **Always** checks before acting (idempotent)
- **RAF and Device Audits are report-only** — zero file modifications

See [.claude/skills/speed-doctor/rules/safety.md](.claude/skills/speed-doctor/rules/safety.md) for the complete boundary definition.

## Claude Code Skill

If you use [Claude Code](https://claude.ai/code), Speed-Doctor includes a skill definition:

```
.claude/skills/speed-doctor/SKILL.md
```

This enables Claude to run Speed-Doctor automatically when you say things like:
- "optimize website performance"
- "make the site faster"
- "make website smooth"
- "improve core web vitals"
- "run speed-doctor"

## Requirements

- Node.js 16 or later
- `npm install` to install `sharp`, `glob`, `node-fetch`, `chalk`

## Project Structure

```
Speed-Doctor/
├── .claude/skills/speed-doctor/
│   ├── SKILL.md              # Claude Code skill definition
│   └── rules/
│       └── safety.md         # What is never modified
├── scripts/
│   ├── index.js              # Master runner (npm run speed-doctor)
│   ├── optimize-images.js    # WebP conversion
│   ├── optimize-fonts.js     # Font self-hosting
│   ├── optimize-preload.js   # Preload/prefetch injection
│   ├── optimize-lazy.js      # Lazy loading audit
│   ├── optimize-decoding.js  # Image decode off main thread
│   ├── optimize-motion.js    # Reduced-motion CSS guard
│   ├── audit-raf.js          # RAF rate-independence audit (report only)
│   ├── audit-device.js       # Cross-device risk audit (report only)
│   ├── report.js             # Report generator
│   └── utils.js              # Shared utilities
├── src/
│   ├── analyzers/
│   │   ├── findImages.js     # Image discovery
│   │   ├── findFonts.js      # Font dependency detection
│   │   ├── findAboveFold.js  # Above-fold classification
│   │   └── findRoutes.js     # Lazy route detection
│   └── utils/
│       ├── fileUtils.js      # File I/O
│       ├── htmlUtils.js      # HTML parsing/modification
│       └── encodeUtils.js    # URL encoding helpers
├── docs/
│   ├── getting-started.md
│   ├── optimization-guide.md
│   └── framework-support.md
├── examples/
│   └── report-template.md
├── package.json
└── LICENSE
```

## License

MIT — see [LICENSE](LICENSE)
