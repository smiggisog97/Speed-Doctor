# Getting Started with Speed-Doctor

Speed-Doctor is a Node.js CLI tool that automatically optimizes website performance without touching your design, layout, or code logic.

## Requirements

- Node.js 16 or later
- A Vite/React, Next.js, Vue, Astro, or plain HTML project

## Installation

### Option A: Run in your project (recommended)

Copy the Speed-Doctor scripts into your project:

```bash
# Clone into a sibling directory
git clone https://github.com/smiggisog97/Speed-Doctor speed-doctor
cd speed-doctor
npm install

# Run against your project
node scripts/index.js --dir /path/to/your/project
```

### Option B: Install globally

```bash
npm install -g speed-doctor
cd /path/to/your/project
speed-doctor
```

### Option C: Add to your project as a dev dependency

```bash
npm install --save-dev speed-doctor
```

Then add to your `package.json`:

```json
{
  "scripts": {
    "speed-doctor": "speed-doctor"
  }
}
```

## Running Your First Optimization

1. Navigate to your project directory (or use `--dir`):

```bash
node scripts/index.js
# or
npm run speed-doctor
```

2. Speed-Doctor will run 8 optimization and audit passes and print progress for each.

3. After completion, review `OPTIMIZATION_REPORT.md` in your project root.

4. Commit the changes:

```bash
git add -A
git commit -m "perf: apply Speed-Doctor optimizations"
```

## What Happens on First Run

Speed-Doctor performs these steps in order:

1. **Image compression** — Scans `public/`, converts PNG/JPG to WebP, updates all references in your source files.

2. **Font self-hosting** — Finds `@import url(fonts.googleapis.com/...)` in your CSS, downloads the font files to `public/fonts/`, replaces imports with local `@font-face` rules.

3. **Preload injection** — Analyzes your source files for above-fold images, injects `<link rel="preload">` tags into `index.html`.

4. **Lazy loading audit** — Finds `loading="lazy"` on hero/banner images, upgrades them to `loading="eager" fetchpriority="high"`.

5. **Image decoding** — Adds asynchronous decoding to suitable below-fold images.

6. **Reduced motion** — Adds an accessibility-safe motion-duration guard.

7. **RAF audit** — Reports refresh-rate-dependent animation loops.

8. **Device audit** — Reports browser-specific risks without modifying source files.

## Idempotent by Design

Speed-Doctor is safe to run multiple times. Each pass checks before acting:

- Won't re-convert images that already have a newer `.webp` version
- Won't re-inject `<link>` tags already present in `index.html`
- Won't re-download fonts already in `public/fonts/`
- Won't add the scrollbar rule if it already exists

## Running Individual Passes

```bash
npm run optimize:images     # WebP conversion
npm run optimize:fonts      # Font self-hosting
npm run optimize:preload    # Preload/prefetch
npm run optimize:lazy       # Lazy loading audit
npm run optimize:decoding   # Below-fold image decoding
npm run optimize:motion     # Reduced-motion accessibility guard
npm run audit:raf           # RAF rate-independence audit (report only)
npm run audit:device        # Device compatibility audit (report only)
npm run report              # Regenerate report
```

## Next Steps

- Read [Optimization Guide](optimization-guide.md) for details on each pass
- Read [Framework Support](framework-support.md) for framework-specific notes
- Check `OPTIMIZATION_REPORT.md` for remaining manual recommendations
