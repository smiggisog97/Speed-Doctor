# Speed-Doctor Safety Rules

These rules define the **hard boundaries** of what Speed-Doctor will and will not touch.
Any optimization that would require crossing these boundaries must be skipped entirely.

---

## NEVER Modify

### Visual Design
- CSS values for `margin`, `padding`, `gap`, `width`, `height`, `min-*`, `max-*`
- Colors: hex values, `rgb()`, `hsl()`, CSS custom properties containing colors
- Typography: `font-size`, `font-weight`, `line-height`, `letter-spacing`, `font-family` values
- Shadows: `box-shadow`, `text-shadow`, `filter: drop-shadow`
- Border radius, border width, border colors

### Animations & Motion
- `animation`, `transition`, `@keyframes` rules
- Framer Motion props: `initial`, `animate`, `exit`, `variants`, `transition`, `whileHover`, `whileTap`
- GSAP configurations, Lottie definitions
- `transform`, `translate`, `rotate`, `scale` values

### Component Structure & Layout
- JSX/HTML structure (adding/removing/reordering elements)
- CSS `display`, `flex`, `grid`, `position`, `z-index` values
- Component file organization or naming
- Import structure beyond image format references

### Content & Copy
- Text content in JSX, HTML, or translation files
- `alt` attribute text on images
- `aria-label`, `aria-describedby`, or other accessibility attributes
- Metadata in `<head>` beyond preload/prefetch hints

### Business Logic & State
- JavaScript/TypeScript logic files
- React hooks, context, state management (Redux, Zustand, Jotai, etc.)
- API calls, data fetching, routing logic
- Event handlers beyond what's explicitly documented for hover-prefetch injection

### Configuration Files
- `vite.config.ts/js`, `next.config.js`, `astro.config.mjs`
- `tailwind.config.js`, `postcss.config.js`
- `tsconfig.json`, `jsconfig.json`
- `.env`, `.env.local`, or any environment files
- `package.json` scripts or dependencies (beyond what's installed for Speed-Doctor itself)

---

## ONLY Modify

### Image Files
- Convert `.png`, `.jpg`, `.jpeg` → `.webp` (originals preserved)
- File lives in: `public/`, `assets/`, `src/assets/`, `static/`

### Image References in Source
- Update import paths: `'./hero.png'` → `'./hero.webp'`
- Update src attributes: `src="photo.jpg"` → `src="photo.webp"`
- Scope: only the file extension reference, nothing else

### Font Files
- Download `.woff2`/`.woff` font files to `public/fonts/`
- Replace `@import url(fonts.googleapis.com/...)` with `@font-face` blocks using local paths
- Add `font-display: block` to downloaded font faces
- Only modifies: the specific `@import` line and the CSS files that contain it

### HTML `<head>` Hints
- Add `<link rel="preload" as="image">` tags before `</head>` in `index.html`
- Add `<link rel="prefetch">` tags before `</head>` in `index.html`
- Add `<link rel="preload" as="font">` tags for self-hosted fonts
- Deduplication: never add a tag that already exists

### Loading Attributes
- Change `loading="lazy"` to `loading="eager"` on images in above-fold components
- Add `fetchpriority="high"` alongside `loading="eager"`
- Scope: only images heuristically classified as above-fold (hero, banner, nav logo)

### Scrollbar CSS
- Add `overflow-y: scroll; scrollbar-gutter: stable;` to the `html {}` selector
- Only in global CSS files: `index.css`, `globals.css`, `app.css`, `main.css`, `base.css`
- Only adds properties; never removes or reorders existing CSS

---

## Heuristics Used (Not Business Logic)

Speed-Doctor uses file-name and class-name heuristics to determine context:

- **Above-fold keywords**: `hero`, `banner`, `cover`, `header`, `landing`, `splash`
- **Navigation keywords**: `nav`, `navbar`, `navigation`, `topbar`
- **Below-fold keywords**: `footer`, `testimonial`, `contact`, `gallery`, `card`

If classification is uncertain, Speed-Doctor errs toward **no modification**.

---

## When to Stop and Ask

Speed-Doctor should pause and report instead of acting when:

1. A CSS file modifies `@font-face` in ways that suggest hand-crafted subsetting
2. An image is referenced via a complex dynamic expression (template literals, computed paths)
3. A "global" CSS file contains component-specific rules mixed with reset styles
4. The project uses a non-standard directory structure not covered by known patterns

In these cases, output a recommendation in `OPTIMIZATION_REPORT.md` under "Manual Review Required".
