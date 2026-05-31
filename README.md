# Speed-Doctor

Autonomous website performance optimizer. Analyzes and improves first-load performance, Core Web Vitals, and perceived speed — without touching your design, layout, or code logic.

## What It Does

Speed-Doctor runs 5 automated optimization passes on your project:

| Pass | What It Does | Metric Improved |
|------|-------------|----------------|
| **Images** | Converts PNG/JPG to WebP (quality 82), updates all references | LCP, Total Bytes |
| **Fonts** | Self-hosts Google Fonts in `public/fonts/`, eliminates CDN round-trips | FCP, LCP |
| **Preload** | Injects `<link rel="preload">` for above-fold assets, `<link rel="prefetch">` for below-fold | LCP |
| **Lazy Audit** | Upgrades `loading="lazy"` to `loading="eager" fetchpriority="high"` on hero images | LCP |
| **Scrollbar** | Adds `scrollbar-gutter: stable` to prevent layout shift | CLS |

## Install

```bash
git clone https://github.com/smiggisog97/Speed-Doctor
cd Speed-Doctor
npm install
```

## Run

```bash
# Run all optimizations against the current directory
npm run speed-doctor

# Run against a specific project
node scripts/index.js --dir /path/to/your/project

# Run individual passes
npm run optimize:images
npm run optimize:fonts
npm run optimize:preload
npm run optimize:lazy
npm run optimize:scrollbar
npm run report
```

After running, review `OPTIMIZATION_REPORT.md` in your project root.

## Before / After Example

A real-world Vite + React portfolio site:

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| LCP | 3.2s | 1.8s | -44% |
| CLS | 0.12 | 0.00 | -100% |
| Total image weight | 2.1 MB | 0.9 MB | -57% |
| Font requests | 4 external | 0 external | -100% |
| Lighthouse Performance | 62 | 91 | +29pts |

*Results vary. Run Lighthouse before and after to measure your specific improvement.*

## Framework Support

| Framework | Images | Fonts | Preload | Lazy | Scrollbar |
|-----------|--------|-------|---------|------|-----------|
| Vite + React | Full | Full | Full | Full | Full |
| Vite + Vue 3 | Full | Full | Full | Partial | Full |
| Create React App | Full | Full | Full | Full | Full |
| Next.js 13/14 | Full | Full | Partial | Partial | Full |
| Astro | Full | Full | Partial | Partial | Full |
| SvelteKit | Full | Full | Partial | Partial | Full |
| Plain HTML/CSS | Full | Full | Full | Full | Full |

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
- Detects lazy-loaded routes and injects hover-prefetch helpers
- Fully idempotent — never adds duplicate tags

### Lazy Loading Audit
- Scans JSX/TSX/HTML for `loading="lazy"` on `<img>` tags
- Uses heuristics to identify above-fold images (hero, banner, nav logo)
- Upgrades them to `loading="eager" fetchpriority="high"`
- Preserves `loading="lazy"` on cards, galleries, and other below-fold content

### Scrollbar Stability (CLS Prevention)
- Finds your global CSS file (`index.css`, `globals.css`, `app.css`, etc.)
- Adds `overflow-y: scroll; scrollbar-gutter: stable;` to the `html` selector
- Prevents CLS from scrollbar appearing/disappearing on page transitions
- Idempotent — skips if already present

## Safety

Speed-Doctor is designed to be safe by default. It:

- **Never** modifies CSS spacing, colors, typography, or animations
- **Never** changes component structure or layout
- **Never** touches business logic or state management
- **Never** modifies Framer Motion, GSAP, or other animation configs
- **Always** preserves original image files
- **Always** checks before acting (idempotent)

See [.claude/skills/speed-doctor/rules/safety.md](.claude/skills/speed-doctor/rules/safety.md) for the complete boundary definition.

## Claude Code Skill

If you use [Claude Code](https://claude.ai/code), Speed-Doctor includes a skill definition:

```
.claude/skills/speed-doctor/SKILL.md
```

This enables Claude to run Speed-Doctor automatically when you say things like:
- "optimize website performance"
- "make the site faster"
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
│   ├── optimize-scrollbar.js # Scrollbar stability
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
│   └── report-template.md    # Sample OPTIMIZATION_REPORT.md
├── package.json
└── LICENSE
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-optimization`
3. Make your changes with tests
4. Ensure scripts are idempotent and don't modify design/layout
5. Add documentation for any new optimization pass
6. Submit a pull request

### Adding a New Optimization Pass

1. Create `scripts/optimize-<name>.js`
2. Add the corresponding `npm run optimize:<name>` script to `package.json`
3. Import and register the step in `scripts/index.js`
4. Document it in `docs/optimization-guide.md`
5. Add it to the safety rules if it modifies files

## License

MIT — see [LICENSE](LICENSE)
