// This site's CSP forbids javascript: URLs, so a click on the button here loads the same code as a file instead.
// Dragged to the bookmarks bar, the href runs on other pages as a normal bookmarklet.
const root = document.querySelector<HTMLElement>('[data-bookmarklet]')
if (root) {
  const status = root.querySelector('[data-status]')!
  const link = root.querySelector<HTMLAnchorElement>('[data-run]')!

  link.addEventListener('click', (e) => {
    e.preventDefault()
    const s = document.createElement('script')
    s.src = '/loupe-measure.js'
    s.onload = () => s.remove()
    s.onerror = () => (status.textContent = 'Couldn’t load the measuring script. Check your connection and try again.')
    document.head.append(s)
  })

  const copy = root.querySelector<HTMLElement>('[data-copy-bookmarklet]')!
  copy.hidden = false
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link.getAttribute('href')!)
      status.textContent = 'Copied. Now bookmark any page, edit that bookmark, and paste this in place of its address.'
    } catch {
      status.textContent = 'Couldn’t copy. Long-press or right-click the button above and copy the link address instead.'
    }
  })
}

export {}
