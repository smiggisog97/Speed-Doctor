---
name: speed-doctor
description: Autonomous website performance optimizer. Analyzes and improves first-load performance, Core Web Vitals, animation smoothness, and perceived speed without changing design, layout, or functionality.
triggers:
  - "run speed-doctor"
  - "optimize website performance"
  - "optimize assets"
  - "improve core web vitals"
  - "make site faster"
  - "speed doctor"
  - "performance audit"
  - "make website smooth"
---

# Speed-Doctor Skill v1.1.0

When invoked, analyze the current project and run all performance optimizations automatically.

## Prerequisites

Speed-Doctor requires Node.js 16+ and the following dependencies:

```bash
npm install sharp glob node-fetch chalk
```

Or if already in the Speed-Doctor repo:

```bash
npm install
```

## Steps

1. **Check dependencies**: Verify `sharp` is installed in the target project or globally.

2. **Run optimizations** from the Speed-Doctor directory, targeting the project:
   ```bash
   node scripts/index.js --dir /path/to/your/project
   ```
   Or if Speed-Doctor is installed in the project itself:
   ```bash
   npm run speed-doctor
   ```

3. **Review the generated report**: Open `OPTIMIZATION_REPORT.md` in the target project root.

4. **Commit the changes**:
   ```bash
   git add -A
   git commit -m "perf: apply Speed-Doctor optimizations

   - WebP image conversion
   - Font self-hosting
   - Critical asset preloading
   - Lazy loading audit
   - Image decoding off main thread
   - Reduced-motion safety net
   - RAF rate-independence audit"
   ```

## What Gets Optimized

| Pass | What It Does | Impact |
|------|-------------|--------|
| Images | Converts PNG/JPG → WebP (quality 82) | −30–60% image weight |
| Fonts | Self-hosts Google Fonts in public/fonts/ | Eliminates 2–3 render-blocking requests |
| Preload | Injects `<link rel="preload">` for above-fold assets | −200–500ms LCP |
| Lazy | Audits `loading="lazy"` on hero images, fixes to eager | −100–300ms LCP |
| Decoding | Adds `decoding="async"` to below-fold images | Reduces scroll jank, off-thread decode |
| Motion | Adds `prefers-reduced-motion` CSS guard | Smooth on battery-saver/low-power devices |
| RAF Audit | Flags rAF loops without time-delta guards (report only) | Fixes 120Hz runaway bug |

## Safety Rules

See `rules/safety.md` for the complete list. Key points:

- NEVER modify component layout, CSS spacing, or animation configs
- NEVER change design tokens (colors, fonts, sizes)
- NEVER touch business logic or state
- ONLY modify: image formats, font loading, HTML hints, loading/decoding attributes, CSS media queries
- RAF Audit is report-only — never modifies source files

## Running Individual Passes

```bash
npm run optimize:images     # WebP conversion only
npm run optimize:fonts      # Font self-hosting only
npm run optimize:preload    # Preload/prefetch injection only
npm run optimize:lazy       # Lazy loading audit only
npm run optimize:decoding   # Image decoding="async" injection
npm run optimize:motion     # Reduced-motion CSS guard
npm run audit:raf           # RAF rate-independence audit (report only)
npm run report              # Regenerate report only
```

## Targeting a Specific Project

All scripts accept a `--dir` flag:

```bash
node scripts/optimize-images.js --dir /Users/me/my-vite-app
node scripts/index.js --dir /Users/me/my-vite-app
```

## Framework Support

| Framework | Support |
|-----------|---------|
| Vite + React | Full |
| Vite + Vue | Full |
| Create React App | Full |
| Next.js | Partial (images + lazy + decoding) |
| Astro | Partial (images + motion) |
| Plain HTML/CSS | Full |
| Nuxt | Partial |

## The 120Hz Runaway Bug (RAF Audit)

Animations that move things by a fixed amount per `requestAnimationFrame` call run
2× faster on 120Hz displays. The RAF Audit pass scans for loops missing a time-delta
guard and reports file + line numbers. Fix pattern:

```js
const STEP = 1000 / 60;
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
