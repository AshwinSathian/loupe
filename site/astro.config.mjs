// @ts-check
import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Cloudflare serves dist/ straight from its edge: every page is a file, there is no adapter and no request-time code.
// After the build, the hashed font's real name replaces __FONT__ in dist/_headers, so the Link header can start the
// download (103 Early Hints) before the HTML has even finished arriving.
const headers = {
  name: 'font-link-header',
  hooks: {
    'astro:build:done': ({ dir }) => {
      const root = fileURLToPath(dir)
      const font = fs.readdirSync(path.join(root, '_astro')).find((f) => /^bricolage-grotesque.*\.woff2$/.test(f))
      if (!font) throw new Error('No Bricolage font in dist/_astro: the Link header has nothing to preload')
      const file = path.join(root, '_headers')
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('__FONT__', `/_astro/${font}`))
    },
  },
}

export default defineConfig({
  site: 'https://loupe.ashwinsathian.com',
  output: 'static',
  trailingSlash: 'never',
  // /method is dist/method.html; Cloudflare's auto-trailing-slash serves it at /method.
  build: { format: 'file', inlineStylesheets: 'always' },
  // Prefetching is src/scripts/prefetch.ts, with the navigation feedback, not Astro's separate script.
  prefetch: false,
  devToolbar: { enabled: false },
  integrations: [sitemap({ serialize: (item) => ({ ...item, lastmod: new Date().toISOString().slice(0, 10) }) }), headers],
  // The CSP forbids inline scripts and data: fonts, so nothing is inlined as a data: URI.
  vite: { build: { assetsInlineLimit: 0 } },
})
