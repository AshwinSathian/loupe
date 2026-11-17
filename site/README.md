# loupe site

The website at <https://loupe.ashwinsathian.com>. Not part of the skill. Astro, every page prerendered to a file, served by Cloudflare Workers static assets: no adapter, no request-time code.

```
npm install
npm run dev        # http://localhost:4321
npm test           # astro check, build, then tests/*.test.mjs against dist/
npx wrangler dev   # serves dist/ with the real _headers (CSP, Link, cache rules)
npm run deploy     # build + wrangler deploy
```

Everything the site quotes (SKILL.md, the rules, the blind round's results, the reports) is read from the repository root at build time, so the pages cannot drift from the skill.

## Why it loads fast

- Bricolage Grotesque for all text, as one variable woff2 cut to Latin and weights 400-800 (about 26 KB, `tools/cut-fonts.sh`). Code is the one exception, in JetBrains Mono (about 8 KB), which the browser fetches only on a page that has code. A metric-matched fallback keeps the swap from moving the layout.
- The font is preloaded by an HTTP `Link` header, so Cloudflare can send it as a 103 Early Hint. `astro.config.mjs` writes the hashed file name into `dist/_headers`.
- CSS is inline: no stylesheet request. JavaScript is small per-page modules with no framework; every interactive piece is plain HTML first (all five findings are in the page without JS).
- Pages are `max-age=60, stale-while-revalidate=600`; `/_astro/*` is immutable.
- Speculation Rules prefetch the nav pages and prerender on hover; `src/scripts/prefetch.ts` covers Safari and touch. View transitions are CSS only.
- Waiting states show their shape: a shimmering page skeleton if a navigation takes over 150 ms, image placeholders, the measured heading's readout, the seal checker.
- Social cards are generated at build time (satori + resvg) in the same typeface.

## Checks

`tests/` fails the build on: a font other than the two, a glyph missing from the font cut, a font over 30 KB, home HTML over 18 KB gzipped, a stylesheet link, an inline script, a missing canonical or h1, broken links, an `<img>` without dimensions, a page missing from `_headers` or the sitemap. The specimen page fails the build if a colour pair drops below its WCAG threshold.

## Content security policy

`script-src 'self'`: no inline script anywhere. That is why the "measure this page" button on /tools loads `/loupe-measure.js` instead of running the `javascript:` link (the link still works as a bookmarklet on other sites).
