import { floor2, hex, over, ratio, type RGBA } from '../lib/contrast'
import { checks } from '../lib/checks'

// The browser parses the colour (any CSS syntax it supports) and composites it on a canvas: white, then the
// background, then the foreground. That is what a page shows, and what scripts/measure.js reads. Out-of-gamut colours
// are clamped to sRGB by the canvas.
const root = document.querySelector<HTMLElement>('[data-checker]')
if (root) {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  const white: RGBA = [255, 255, 255, 1]
  const $ = <T extends Element>(s: string) => root.querySelector<T>(s)!

  const valid = (s: string) => {
    ctx.fillStyle = '#000'
    ctx.fillStyle = s
    const a = ctx.fillStyle
    ctx.fillStyle = '#fff'
    ctx.fillStyle = s
    return s.trim() !== '' && a === ctx.fillStyle
  }

  // Parse any CSS colour to RGBA without blending. The canvas serialises a colour it understands as #rrggbb or
  // rgba(r, g, b, a); anything it keeps in another syntax (oklch, lab) is read from a pixel drawn on a cleared canvas.
  const parse = (s: string): RGBA => {
    ctx.fillStyle = '#000'
    ctx.fillStyle = s
    const v = String(ctx.fillStyle)
    if (v.startsWith('#')) return hex(v)
    const m = /^rgba?\(([^)]+)\)$/.exec(v)
    if (m) {
      const [r, g, b, a = 1] = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number)
      return [r!, g!, b!, a]
    }
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 255) / 255]
  }

  const toHex = ([r, g, b]: RGBA) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

  const text = { fg: $<HTMLInputElement>('[data-text=fg]'), bg: $<HTMLInputElement>('[data-text=bg]') }
  const picker = { fg: $<HTMLInputElement>('[data-picker=fg]'), bg: $<HTMLInputElement>('[data-picker=bg]') }
  const hint = { fg: $('[data-hint=fg]'), bg: $('[data-hint=bg]') }
  const result = $('[data-result]')
  const sample = $<HTMLElement>('[data-sample]')
  const said = $('[data-said]')
  let timer: number | undefined

  const render = () => {
    const ok = { fg: valid(text.fg.value), bg: valid(text.bg.value) }
    for (const k of ['fg', 'bg'] as const) {
      text[k].setAttribute('aria-invalid', String(!ok[k]))
      if (!ok[k])
        hint[k].textContent = 'Enter a colour the browser can read, such as #1a1d23, rgb(26 29 35) or oklch(0.23 0.01 260).'
    }
    if (!ok.fg || !ok.bg) {
      result.innerHTML = '<p>Enter two colours the browser understands: hex, rgb(), hsl(), oklch(), a named colour.</p>'
      sample.hidden = true
      clearTimeout(timer)
      timer = window.setTimeout(() => (said.textContent = 'Not a colour the browser can read.'), 500)
      return
    }
    // Same order as scripts/contrast.py: background over white, foreground over that.
    const b = over(parse(text.bg.value), white)
    const f = over(parse(text.fg.value), b)
    const r = floor2(ratio(f, b))
    hint.fg.textContent = `Renders as ${toHex(f)} in sRGB.`
    hint.bg.textContent = `Renders as ${toHex(b)} in sRGB.`
    picker.fg.value = toHex(f)
    picker.bg.value = toHex(b)
    result.innerHTML =
      `<p class="checker-ratio"><span class="m">${r.toFixed(2)}:1</span></p><ul class="checker-verdicts">` +
      checks
        .map(
          (c) =>
            `<li><span class="tag${r >= c.need ? '' : ' blocker'}">${r >= c.need ? 'Pass' : 'Fail'}</span> ${c.label} <span class="muted">needs ${c.need}:1, WCAG ${c.sc}</span></li>`,
        )
        .join('') +
      '</ul>'
    sample.hidden = false
    // The same white base the ratio is computed over, whatever the frame behind it is.
    sample.style.background = `linear-gradient(${text.bg.value}, ${text.bg.value}), #fff`
    sample.style.color = text.fg.value
    // One short announcement after typing pauses, not the whole panel on every key.
    clearTimeout(timer)
    timer = window.setTimeout(() => (said.textContent = `${r.toFixed(2)} to 1, ${r >= 4.5 ? 'passes' : 'fails'} body text`), 500)
  }

  for (const k of ['fg', 'bg'] as const) {
    text[k].addEventListener('input', render)
    picker[k].addEventListener('input', () => {
      text[k].value = picker[k].value
      render()
    })
  }
}
