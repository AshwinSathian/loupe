// The ring over the screenshot. The stage is a window onto the sheet; the sheet pans so the finding sits mid-window,
// like sliding a contact sheet under a loupe. Selection is a tab list: arrows, Home and End move it.
const ZOOM = 2.5
const R = 84 // ring radius in CSS px

for (const root of document.querySelectorAll<HTMLElement>('[data-loupe]')) {
  const spots = JSON.parse(root.dataset.spots!) as { x: number; y: number }[]
  const src = root.dataset.src!
  const width = Number(root.dataset.width)
  const height = Number(root.dataset.height)
  const stage = root.querySelector<HTMLElement>('.loupe-stage')!
  const sheet = root.querySelector<HTMLElement>('.loupe-sheet')!
  const ring = root.querySelector<HTMLElement>('.loupe-ring')!
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role=tab]')]
  const panels = [...root.querySelectorAll<HTMLElement>('[role=tabpanel]')]
  let i = 0
  let t: number | undefined

  const place = () => {
    const k = stage.clientWidth / width // displayed width / screenshot width
    const s = spots[i]!
    // The stage's height comes from CSS (aspect-ratio); the script only reads it, or the two feed each other.
    const view = stage.clientHeight
    const off = Math.max(0, Math.min(s.y * k - view / 2, height * k - view))
    sheet.style.transform = `translateY(${-off}px)`
    ring.style.transform = `translate(${s.x * k - R}px, ${s.y * k - off - R}px)`
    ring.style.backgroundSize = `${width * k * ZOOM}px ${height * k * ZOOM}px`
    ring.style.backgroundPosition = `${R - s.x * k * ZOOM}px ${R - s.y * k * ZOOM}px`
  }

  const select = (n: number, focus = false) => {
    i = (n + spots.length) % spots.length
    tabs.forEach((tab, j) => {
      tab.setAttribute('aria-selected', String(j === i))
      tab.tabIndex = j === i ? 0 : -1
      panels[j]!.hidden = j !== i
    })
    if (focus) tabs[i]!.focus()
    place()
  }

  // Without script every finding is shown in a list; with it, one at a time under the ring.
  root.querySelector<HTMLElement>('[role=tablist]')!.hidden = false
  tabs.forEach((tab, n) => tab.addEventListener('click', () => select(n)))
  root.querySelector('[role=tablist]')!.addEventListener('keydown', (e) => {
    const key = (e as KeyboardEvent).key
    const next: Record<string, number> = {
      ArrowDown: i + 1,
      ArrowRight: i + 1,
      ArrowUp: i - 1,
      ArrowLeft: i - 1,
      Home: 0,
      End: spots.length - 1,
    }
    if (key in next) {
      e.preventDefault()
      select(next[key]!, true)
    }
  })

  // Snap, don't glide, while the window is resized, so the zoom stays registered.
  new ResizeObserver(() => {
    root.classList.add('still')
    place()
    clearTimeout(t)
    t = window.setTimeout(() => root.classList.remove('still'), 150)
  }).observe(stage)

  // The magnified copy is the same file the stage shows; fetch it only once the stage is near the screen.
  new IntersectionObserver(
    (entries, io) => {
      if (!entries.some((e) => e.isIntersecting)) return
      ring.style.backgroundImage = `url(${src})`
      io.disconnect()
    },
    { rootMargin: '600px' },
  ).observe(stage)

  ring.hidden = false
  place()
}

export {}
