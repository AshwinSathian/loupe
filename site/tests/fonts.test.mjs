// Guards the first paint and the one-typeface rule. Run after the build (`npm test`).
// A failure names the rule. Budgets are ceilings: raise one only with a line in the commit saying why.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const DIST = 'dist'
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
const pages = walk(DIST).filter((f) => f.endsWith('.html') && !f.endsWith('404.html'))
const gz = (b) => zlib.gzipSync(b).length
const KB = 1024
// A font above ~42 KB takes a third TCP round trip to arrive, so the ceiling sits well under it.
const BUDGET = { 'bricolage-grotesque': 30 * KB, 'jetbrains-mono': 12 * KB, homeHtmlGz: 18 * KB }

const cutOf = (n) => new Set(JSON.parse(fs.readFileSync(`src/fonts/${n}.codepoints.json`, 'utf8')))
const cut = cutOf('bricolage-grotesque')
const mono = cutOf('jetbrains-mono')
const decode = (h) =>
  h
    .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, ' ')
// Drawn by the system font on purpose: a handful of signs the face lacks, in quoted reports and the skill's own text.
// Keep this short; each one is a glyph some reader sees in a different face.
const SYSTEM_DRAWN = new Set([...'→←↑↓≥≤≈≠✓✗⌘⌥⇧☆★▸↔\u2011'])

test('two faces: Bricolage Grotesque for the site, JetBrains Mono for code only', () => {
  const files = fs.readdirSync(path.join(DIST, '_astro')).filter((f) => /\.(woff2?|ttf|otf)$/.test(f))
  assert.deepEqual(files.map((f) => f.split('.')[0]).sort(), ['bricolage-grotesque', 'jetbrains-mono'])
  for (const f of files) {
    const size = fs.statSync(path.join(DIST, '_astro', f)).size
    const max = BUDGET[f.split('.')[0]]
    assert.ok(size <= max, `${f} is ${size} bytes, over ${max}`)
  }
  for (const p of pages) {
    const css = [...fs.readFileSync(p, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
    const families = [...css.matchAll(/font-family:\s*([^;}]+)/g)].map((m) => m[1].trim())
    const bad = families.filter((f) => !/^(var\(--(sans|mono)\)|inherit|["']?(Bricolage (Grotesque Variable|Fallback)|JetBrains Mono Variable)["']?.*|ui-monospace.*)$/.test(f))
    assert.deepEqual(bad, [], `${p} sets a font family other than the two`)
  }
})

test('only the text face is preloaded, by a Link header, not by the HTML', () => {
  const headers = fs.readFileSync(path.join(DIST, '_headers'), 'utf8')
  assert.ok(!headers.includes('__FONT__'), '_headers still has the placeholder: the build hook did not run')
  const link = headers.match(/Link: <(\/_astro\/bricolage-grotesque[^>]+\.woff2)>/)?.[1]
  assert.ok(link && fs.existsSync(path.join(DIST, link)), `the Link header names a font that does not exist: ${link}`)
  for (const p of pages) assert.ok(!/<link[^>]+rel="preload"[^>]+as="font"/.test(fs.readFileSync(p, 'utf8')), `${p} also preloads the font in its HTML`)
})

test('CSS stays inline: no page waits on a stylesheet request', () => {
  for (const p of pages) {
    const html = fs.readFileSync(p, 'utf8')
    assert.ok(!/<link[^>]+rel="stylesheet"/.test(html), `${p} links a stylesheet`)
    assert.ok(/<style[^>]*>[^<]{1000,}/.test(html), `${p} has no inline CSS`)
  }
})

test('home page HTML with its CSS fits the budget', () => {
  const n = gz(fs.readFileSync(path.join(DIST, 'index.html')))
  assert.ok(n <= BUDGET.homeHtmlGz, `index.html is ${(n / KB).toFixed(1)} KB gzipped, over ${BUDGET.homeHtmlGz / KB}`)
})

test('every character on every page is in the cut of the face that draws it', () => {
  for (const p of pages) {
    const html = fs.readFileSync(p, 'utf8')
    // Code is <pre>, <code> and <kbd>; the checker's text inputs are code too, but hold no static text.
    const code = new Set([...html.matchAll(/<(pre|code|kbd)[^>]*>([\s\S]*?)<\/\1>/g)].flatMap((m) => [...decode(m[2].replace(/<[^>]+>/g, ''))]))
    const text = decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' '))
    const missing = [...new Set([...text].filter((c) => !/\s/.test(c) && !cut.has(c.codePointAt(0)) && !SYSTEM_DRAWN.has(c) && !(code.has(c) && mono.has(c.codePointAt(0)))))]
    assert.deepEqual(missing, [], `${p}: not in a font cut (add to tools/cut-fonts.sh and rerun it): ${missing.join(' ')}`)
  }
})
