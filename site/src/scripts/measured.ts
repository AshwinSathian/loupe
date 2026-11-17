import { floor2, ratio, type RGBA } from '../lib/contrast'

// Computed colours come back as rgb()/rgba(); anything else (color(), oklch) is left unmeasured.
const rgb = (s: string): RGBA | null => {
  const m = /^rgba?\(([^)]+)\)$/.exec(s)
  if (!m) return null
  const [r, g, b, a = 1] = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number)
  return [r!, g!, b!, a]
}

const box = document.querySelector<HTMLElement>('.measured')
const h1 = box?.querySelector('h1')
if (box && h1) {
  const forced = matchMedia('(forced-colors: active)')
  const dim = box.querySelector('.vdim > span')!
  const size = box.querySelector('[data-size]')!
  const contrast = box.querySelector('[data-contrast]')!
  const row = box.querySelector<HTMLElement>('[data-contrast-row]')!

  const measure = () => {
    const s = getComputedStyle(h1)
    const px = parseFloat(s.fontSize)
    const weight = parseFloat(s.fontWeight)
    const fg = rgb(s.color)
    const bg = rgb(getComputedStyle(document.body).backgroundColor)
    // Where the set text ends, not where the h1 box ends.
    const range = document.createRange()
    range.selectNodeContents(h1)
    const right = Math.max(...[...range.getClientRects()].map((r) => r.right))
    // WCAG large text: 24 px, or 18.66 px at weight 700 or more.
    const large = px >= 24 || (px >= 18.66 && weight >= 700)
    const needs = large ? 3 : 4.5
    // In forced colours the system palette is drawn, not the page's, so there is nothing to report.
    const r = !forced.matches && fg && bg && bg[3] === 1 ? floor2(ratio(fg, bg)) : null

    box.style.setProperty('--text-end', `${right - box.getBoundingClientRect().left}px`)
    dim.textContent = `${Math.round(h1.getBoundingClientRect().height)} px`
    size.innerHTML = `<span class="m" dir="ltr">${px.toFixed(1)} px</span>, ${large ? 'large text' : 'body text'} under WCAG`
    row.hidden = r === null
    if (r !== null)
      contrast.innerHTML = `<span class="m" dir="ltr">${r.toFixed(2)}:1</span>${r >= needs ? ', passes' : ', fails'} 1.4.3, which needs ${needs}:1`
    box.dataset.ready = ''
  }

  // Measure once the real face is in, so the numbers are never the fallback's and never change under the reader.
  ;(document.fonts?.ready ?? Promise.resolve()).then(() => {
    measure()
    new ResizeObserver(measure).observe(h1)
  })
  for (const q of ['(prefers-color-scheme: dark)', '(prefers-contrast: more)', '(forced-colors: active)'])
    matchMedia(q).addEventListener('change', measure)
}
