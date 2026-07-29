# Framework Support

Speed-Doctor is designed primarily for Vite + React projects but works with most modern web frameworks.

## Support Matrix

| Framework | Images | Fonts | Preload | Lazy Audit | Device Audit | Notes |
|-----------|--------|-------|---------|-----------|--------------|-------|
| Vite + React | Full | Full | Full | Full | Full | Primary target |
| Vite + Vue 3 | Full | Full | Full | Partial | Full | JSX not used; template attrs supported |
| Create React App | Full | Full | Full | Full | Full | |
| Next.js 13/14 App Router | Full | Full | Limited | Partial | Full | See Next.js notes |
| Next.js 12 Pages Router | Full | Full | Limited | Full | Full | |
| Astro | Full | Full | Partial | Partial | Partial | See Astro notes |
| SvelteKit | Full | Full | Partial | Partial | Full | |
| Nuxt 3 | Full | Full | Partial | Partial | Full | |
| Plain HTML/CSS | Full | Full | Full | Full | Partial | JavaScript-specific checks may not apply |
| Gatsby | Full | Partial | Partial | Full | Full | |

**Full** = Works automatically  
**Partial** = Works with caveats (see below)  
**Limited** = Some features not applicable to this framework

---

## Vite + React (Primary Target)

No special configuration needed. Speed-Doctor was built for this stack.

Project structure expected:
```
my-project/
├── public/           ← images scanned here
├── src/
│   ├── components/
│   ├── assets/       ← images here also scanned
│   └── index.css     ← scrollbar fix applied here
├── index.html        ← preload tags injected here
└── package.json
```

---

## Next.js

### Images

Next.js has its own image optimization via `<Image>` component. Speed-Doctor's WebP conversion still works for:
- Images in `public/` used with `<img>` tags or CSS backgrounds
- Static images imported directly

If you're using `next/image`, the WebP conversion is redundant but harmless — Next.js will serve WebP from its own optimization pipeline.

### Preload

Next.js doesn't have a static `index.html`. Preload tags should be added to `_document.tsx` or `app/layout.tsx`. Speed-Doctor will warn if `index.html` is not found.

Manual alternative for Next.js:
```tsx
// app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <link rel="preload" as="image" href="/hero.webp" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### Font Self-Hosting

Next.js 13+ has built-in font optimization via `next/font`. If you're using that, Skip the font self-hosting pass — it's already handled.

If you have legacy `@import url(googleapis.com/...)` in CSS, Speed-Doctor will still self-host those correctly.

---

## Astro

### Images

Astro has `<Image>` component with built-in optimization. Speed-Doctor's WebP pass works for:
- Files in `public/` (served as-is, not optimized by Astro)
- Direct `<img>` tags in `.astro` files

For Astro-optimized images (via `import` + `<Image>`), WebP is handled by the build.

### Preload

Astro's `index.html` (in `src/pages/index.astro` or similar) is a template, not a static file. Inject preload tags in your base layout:

```astro
---
// src/layouts/BaseLayout.astro
---
<html>
  <head>
    <link rel="preload" as="image" href="/hero.webp" />
    <slot name="head" />
  </head>
  <body>
    <slot />
  </body>
</html>
```

---

## Vue 3 / Vite + Vue

### Images

Works the same as React. Vue SFC template image references (`<img src="...">`) are updated correctly.

### Lazy Loading

Vue templates use `:loading="'lazy'"` syntax, not `loading="lazy"`. The audit script handles both:
- HTML attribute: `loading="lazy"`
- Vue bound attribute: `:loading="'lazy'"`

### Async Components

`defineAsyncComponent(() => import('./Component.vue'))` is detected by `src/analyzers/findRoutes.js` for hover-prefetch injection.

---

## SvelteKit

### Images

Works for files in `static/` (SvelteKit's equivalent of `public/`). Speed-Doctor scans both `public/` and `static/`.

### Preload

SvelteKit renders via `src/app.html`. Speed-Doctor will update `src/app.html` if `index.html` is not found (planned feature — see issue tracker).

For now, inject preload tags manually in `src/app.html` or via `<svelte:head>` in your root layout.

---

## Tips for Any Framework

### Running against a specific directory

```bash
node scripts/index.js --dir /path/to/my-project
```

### Checking what would change (dry run)

Not yet implemented — use `git diff` after running to review changes.

### Reverting changes

Since Speed-Doctor only adds files (WebP, fonts) and makes targeted edits, you can revert with:

```bash
git checkout -- .   # revert source file changes
git clean -f public/fonts/  # remove downloaded font files
git clean -f public/*.webp  # remove converted WebP files
```
