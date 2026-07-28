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

## Smooth Experience Field Notes

Use these checks when the user reports a site that is technically fast but still feels late,
flashy, or unfinished on a cold browser session.

### Route-critical media must be ready before motion

- Preload and decode route-critical images before scroll/reveal/marquee motion starts.
- Do not leave `loading="lazy"` on images inside moving tracks, horizontal mockup strips,
  first-screen galleries, or anything the user can scroll into immediately.
- For direct route visits, loader navigation, and hover-prefetch navigation, use the same
  asset list so each path warms the same images.
- Reserve exact dimensions or aspect ratios for image frames, phone mockups, album covers,
  and photography tiles so decoded images do not pop into a shifting shell.

### Horizontal mockup strips

For phone UI strips, carousels, and other sideways-scrolled case-study sections:

- Treat every visible and near-next screen as route-critical, even if it starts off-canvas.
- Prefer eager loading plus early `Image.decode()` for all strip screenshots.
- Keep the strip animation timing unchanged; fix readiness, not the design motion.
- Verify by opening in an incognito window, scrolling sideways immediately, and confirming
  no empty device shells appear before the screenshots.

### Moving image tracks

For album covers, photography rails, marquees, and infinite tracks:

- Never lazy-load images inside the moving track.
- Decode all track assets before the track begins moving.
- Use a shared preload helper during loader time and route prefetch so desktop and mobile
  receive the same readiness guarantees.
- Confirm no broken image icons or late tiles after motion starts.

### Icons and navigation

For first-load nav buttons and chips:

- Critical icons should be inline SVGs, statically imported, or preloaded before reveal.
- Do not let the nav entrance animation start while icon files are still undiscovered.
- On mobile sticky nav changes, animate transform, padding, and background with a stable
  transition instead of abruptly toggling visual states.

### Route transition flashes

If a page shows a brief dark or wrong-colored screen between routes:

- Set the destination page background before the transition begins.
- Avoid dark fallback containers for light pages.
- Keep route-shell backgrounds consistent for loader navigation, hover-prefetch, and direct
  URL visits.

### Reveal animation guardrail

When fixing late appearance, avoid hiding the issue with opacity fades. The preferred pattern:

- assets decode first
- layout space is already reserved
- content enters from below at full opacity
- animation duration and easing stay unchanged unless the user explicitly asks to change them

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
