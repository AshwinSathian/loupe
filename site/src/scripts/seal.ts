// Fetches keys.sha256 as committed before any review ran, and each answer key as published now, both from GitHub,
// hashes the keys with Web Crypto, and compares. Nothing comes from this site, so the check doesn't depend on
// trusting it.
const RAW = 'https://raw.githubusercontent.com/AshwinSathian/loupe'

const sha256 = async (bytes: ArrayBuffer) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('')

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

const root = document.querySelector<HTMLElement>('[data-seal]')
if (root) {
  const btn = root.querySelector<HTMLButtonElement>('[data-run]')!
  const out = root.querySelector<HTMLElement>('[data-out]')!
  const status = root.querySelector<HTMLElement>('[data-status]')!
  btn.hidden = false
  const say = (html: string) => (out.innerHTML = html)
  let busy = false
  // aria-disabled, not disabled: a disabled button drops keyboard focus to <body> just as the result arrives.
  btn.addEventListener('click', async () => {
    if (busy) return
    busy = true
    btn.setAttribute('aria-disabled', 'true')
    btn.textContent = 'Checking…'
    say('<p class="hint">Fetching the sealed hashes and the keys from GitHub…</p>')
    try {
      const sealedRes = await fetch(`${RAW}/${root.dataset.commit}/evals/heldout/keys.sha256`)
      if (!sealedRes.ok) throw new Error(`keys.sha256: ${sealedRes.status}`)
      const lines = (await sealedRes.text()).trim().split('\n').map((l) => l.trim().split(/\s+/))
      const rows: string[] = []
      let changed = 0
      for (const [hash, file] of lines) {
        const res = await fetch(`${RAW}/main/evals/heldout/keys/${file}`)
        if (!res.ok) throw new Error(`${file}: ${res.status}`)
        // Hash the bytes as published; text() would drop a byte-order mark.
        const now = await sha256(await res.arrayBuffer())
        if (now !== hash) changed++
        rows.push(
          `<tr><th scope="row"><code>${esc(file!)}</code></th><td><code class="m">${hash!.slice(0, 12)}…</code></td><td><code class="m">${now.slice(0, 12)}…</code></td><td>${now === hash ? 'Yes' : 'No'}</td></tr>`,
        )
      }
      // One sentence in the live region; the table sits outside it, so a screen reader is not read every cell.
      status.textContent = changed
        ? `${changed} of ${rows.length} keys have changed since they were sealed.`
        : `All ${rows.length} keys match the hashes sealed before the runs.`
      say(
        `<div class="table-wrap" tabindex="0"><table><thead><tr><th scope="col">Key</th><th scope="col">Sealed before the runs</th><th scope="col">Hash of the key now</th><th scope="col">Match</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`,
      )
    } catch (e) {
      status.textContent = ''
      say(
        `<p class="hint">Couldn’t reach GitHub, so nothing was checked (${esc((e as Error).message)}). Try again, or compare the files in <a href="https://github.com/AshwinSathian/loupe/tree/main/evals/heldout">evals/heldout/</a> yourself.</p>`,
      )
    } finally {
      busy = false
      btn.removeAttribute('aria-disabled')
      btn.textContent = 'Check the seal'
    }
  })
}
