import fs from 'node:fs'
import path from 'node:path'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { cases } from './cases'
import { nav } from './site'

// Satori reads TTF/OTF/WOFF, not WOFF2, so the cards use the static fontsource files. This runs at build time only:
// the cards are plain PNGs on the edge, set in the same typeface as the site.
const file = (name: string) => fs.readFileSync(path.resolve('node_modules/@fontsource/bricolage-grotesque/files', name))
const fonts = ([400, 700, 800] as const).map((weight) => ({
  name: 'Bricolage Grotesque',
  data: file(`bricolage-grotesque-latin-${weight}-normal.woff`),
  weight,
  style: 'normal' as const,
}))

const C = { paper: '#eae9e6', sheet: '#fdfcfb', ink: '#1a1d23', muted: '#575b62', hair: '#cececb', measure: '#c52f0f' }

type Node = { type: string; props: Record<string, unknown> }
const h = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({
  type,
  props: { style: { display: 'flex', ...style }, children },
})

const ring = (size: number) => ({
  type: 'svg',
  props: {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    children: [
      { type: 'circle', props: { cx: 12, cy: 12, r: 9.5, fill: 'none', stroke: C.ink, strokeWidth: 2.5 } },
      { type: 'path', props: { d: 'M12 7v3M12 14v3M7 12h3M14 12h3', stroke: C.measure, strokeWidth: 1.5 } },
    ],
  },
})

const png = async (tree: Node) => {
  const svg = await satori(tree as never, { width: 1200, height: 630, fonts })
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng()
}

const frame = (children: unknown[]) =>
  h('div', { width: 1200, height: 630, boxSizing: 'border-box', flexDirection: 'column', justifyContent: 'space-between', padding: '60px 72px', background: C.paper, color: C.ink, fontFamily: 'Bricolage Grotesque', position: 'relative' }, children)

const top = (label: string) =>
  h('div', { alignItems: 'center', gap: 14, fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em' }, [
    ring(34),
    h('span', {}, 'loupe'),
    h('span', { marginLeft: 'auto', fontSize: 22, fontWeight: 700, color: C.muted }, label),
  ])

/** The home card: the headline, and a sheet with the loupe over a 2.21:1 note, the number a blind review found. */
const home = () =>
  png(
    frame([
      top('A Claude Code skill'),
      h('div', { flexDirection: 'column', maxWidth: 640 }, [
        h('div', { fontSize: 84, lineHeight: 0.98, letterSpacing: '-0.04em', fontWeight: 800 }, 'A design review that shows its measurements.'),
        h('div', { marginTop: 28, fontSize: 26, color: C.muted, lineHeight: 1.35 }, 'Grounded in Apple’s Human Interface Guidelines. For iOS, macOS and the web.'),
      ]),
      h('div', { position: 'absolute', right: 72, top: 150, width: 380, height: 400, background: C.sheet, border: `1px solid ${C.hair}`, padding: 28, flexDirection: 'column' }, [
        h('div', { height: 14, width: '60%', background: '#e3e2df', marginBottom: 14 }, ''),
        h('div', { height: 14, width: '85%', background: '#e3e2df', marginBottom: 14 }, ''),
        h('div', { fontSize: 17, color: '#a9b0ab', margin: '18px 0 22px' }, 'Power · 18V, two batteries'),
        h('div', { height: 14, width: '70%', background: '#e3e2df', marginBottom: 14 }, ''),
        h('div', { position: 'absolute', left: 120, top: 110, width: 220, height: 220, borderRadius: 110, border: `3px solid ${C.ink}`, background: C.sheet, alignItems: 'center', justifyContent: 'center', fontSize: 40, color: '#a9b0ab' }, 'Power · 18V'),
        h('div', { position: 'absolute', left: 120, top: 352, fontSize: 34, fontWeight: 800, color: C.measure }, '2.21 : 1'),
      ]),
    ]),
  )

const title = (label: string, heading: string, blurb: string) =>
  png(
    frame([
      top(label),
      h('div', { flexDirection: 'column', maxWidth: 980 }, [
        h('div', { fontSize: heading.length > 40 ? 64 : 84, lineHeight: 1, letterSpacing: '-0.035em', fontWeight: 800 }, heading),
        h('div', { marginTop: 28, fontSize: 28, color: C.muted, lineHeight: 1.35 }, blurb),
      ]),
      h('div', { justifyContent: 'space-between', fontSize: 24, color: C.muted, fontWeight: 700 }, [
        h('span', {}, 'loupe.ashwinsathian.com'),
        h('span', { color: C.measure }, 'measured, not estimated'),
      ]),
    ]),
  )

const pages: Record<string, [label: string, heading: string, blurb: string]> = {
  method: ['Method', 'How loupe reviews', 'Apple first, outside research labelled against it, and the rules that decide a Blocker.'],
  cases: ['Cases', 'Unedited reports', 'Full reports from three Claude models, next to the review written without the skill.'],
  testing: ['Testing', 'A pre-registered blind round', 'Three fixtures, three models, three judges, sealed keys, and every loss.'],
  tools: ['Tools', 'Measure it yourself', 'A WCAG contrast checker and a bookmarklet, running in your browser.'],
  compare: ['Compare', 'How loupe compares', 'When to pick axe-core, Lighthouse, Impeccable or others instead, and what loupe does not do.'],
  faq: ['FAQ', 'Questions', 'Apple affiliation, web apps, measurement, code changes, models and privacy.'],
  specimen: ['Specimen', 'How this site is designed', 'The design system, measured, and loupe’s reviews of the site.'],
}
for (const c of cases()) pages[`case-${c.slug}`] = ['Case', c.title, c.kind]

export const cardNames = ['site', ...Object.keys(pages)]
export const card = (name: string) => (name === 'site' ? home() : title(...pages[name]!))
// Pages that name a card must exist in `pages`; the nav list keeps the two in step.
export const navCards = nav.map((n) => n.href.slice(1))
