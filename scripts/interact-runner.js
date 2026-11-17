async (page, opts = {}) => {
  // HOW TO RUN (Playwright MCP, one browser_run_code_unsafe call), the same way as measure-runner.js:
  //   async (page) => (<RUNNER>)(page, { maxStops: 80 })
  // Walks the keyboard with real Tab presses from the top of the page (or from an element that already
  // has focus, such as an open modal's first control) and reports for each stop:
  //   selector, role and accessible name (the first line of Playwright's aria snapshot of the focused
  //   element); whether focus changes anything visible (outline, box-shadow, border, background, colour,
  //   text decoration or transform on the element or either of its two nearest ancestors, which covers
  //   :focus-within rings; a style diff, so a heuristic: warn only); and whether fixed or sticky author
  //   content covers it (WCAG 2.4.11: "entirely" fails, "partly" passes the AA criterion).
  // Also: a keyboard trap (WCAG 2.1.2: focus stays put for 3 presses, or wraps back to a stop other than
  //   the first; a cycle inside an open modal dialog is expected and reported with inDialog: true),
  //   positive tabindex values, and unnamed controls and images anywhere in the page (counted per role
  //   from the page's aria snapshot, which carries no selectors; focusable ones are named per stop).
  // Options: maxStops (default 80), timeMs (default 15000), width (viewport width for the walk), key
  //   (default Tab; Alt+Tab in WebKit, which otherwise skips links and buttons as Safari does).
  // Side effects: focus moves (the page's focus and blur handlers run, as for a keyboard user) and the
  //   page scrolls. Nothing is clicked or typed. Focus is released and the scroll position and viewport
  //   are restored at the end.
  const maxStops = opts.maxStops ?? 80, timeMs = opts.timeMs ?? 15000;
  // WebKit, like Safari, skips links and buttons on Tab unless Option is held.
  let engine = "";
  try { engine = page.context().browser().browserType().name(); } catch { /* persistent context */ }
  const key = opts.key || (engine === "webkit" ? "Alt+Tab" : "Tab");
  const started = Date.now();
  const vp = page.viewportSize();
  if (opts.width) await page.setViewportSize({ width: opts.width, height: vp ? vp.height : 900 });
  const scroll = await page.evaluate(() => [scrollX, scrollY]);
  const preFocused = await page.evaluate(() => { scrollTo(0, 0); const a = document.activeElement; return !!a && a !== document.body && a !== document.documentElement; });

  // In-page probe for the focused element. Defines no globals; page-controlled strings are clipped.
  const probe = () => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    const clip = (s, n = 60) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
    const sel = (e) => {
      const parts = [];
      for (let n = e; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
        if (n.id && document.querySelectorAll(`#${CSS.escape(n.id)}`).length === 1) { parts.unshift(`#${CSS.escape(n.id)}`); break; }
        const sib = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
        parts.unshift(sib.length > 1 ? `${n.tagName.toLowerCase()}:nth-of-type(${sib.indexOf(n) + 1})` : n.tagName.toLowerCase());
      }
      return parts.join(" > ");
    };
    const KEYS = ["outlineStyle", "outlineWidth", "outlineColor", "boxShadow", "borderTopColor", "borderBottomColor", "borderTopWidth", "borderBottomWidth", "backgroundColor", "color", "textDecorationLine", "transform"];
    const chain = [el, el.parentElement, el.parentElement && el.parentElement.parentElement].filter((n) => n && n !== document.body && n !== document.documentElement);
    const snap = () => chain.map((n) => { const s = getComputedStyle(n); return KEYS.map((k) => s[k]).join("|"); });
    const focused = snap();
    el.blur();
    const plain = snap();
    el.focus({ preventScroll: true });
    const visibleChange = focused.some((v, i) => v !== plain[i]);
    // Obscured: sample a 5x5 grid inside the box; a point is covered when the topmost element there is
    // fixed or sticky author content that does not contain el and is not inside it.
    const r = el.getBoundingClientRect();
    const pinned = (n) => { for (; n && n.nodeType === 1; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === "fixed" || p === "sticky") return n; } return null; };
    let covered = 0, inView = 0;
    for (let i = 1; i <= 5; i++) for (let j = 1; j <= 5; j++) {
      const x = r.left + (r.width * i) / 6, y = r.top + (r.height * j) / 6;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      inView++;
      const top = document.elementFromPoint(x, y);
      if (top && top !== el && !el.contains(top) && !top.contains(el) && pinned(top) && !pinned(el)) covered++;
    }
    return {
      selector: sel(el), tag: el.tagName.toLowerCase(), text: clip((el.innerText || el.value || "").trim()),
      visibleChange, tabindex: el.getAttribute("tabindex"),
      obscured: inView === 0 ? "offscreen" : covered === inView ? "entirely" : covered > 0 ? "partly" : "no",
    };
  };

  const stops = [], seen = new Map();
  let trap = null, stuck = 0, last = null;
  try {
    for (let i = 0; i < maxStops && Date.now() - started < timeMs; i++) {
      if (i > 0 || !preFocused) await page.keyboard.press(key);
      const p = await page.evaluate(probe);
      if (!p) { if (stops.length) break; continue; } // focus left the document: the cycle is done
      if (last && p.selector === last.selector) {
        if (++stuck < 3) continue;
        // Firefox keeps focus on the last tabbable element at the end of the page: that is the end of
        // the cycle, not a trap.
        const isLast = await page.evaluate(() => {
          const f = [...document.querySelectorAll('a[href],button,input,select,textarea,summary,iframe,[tabindex],[contenteditable="true"]')]
            .filter((e) => e.tabIndex >= 0 && !e.disabled && e.getClientRects().length && !e.closest("[inert]"));
          return f[f.length - 1] === document.activeElement;
        });
        if (!isLast) trap = { selector: p.selector, kind: "focus does not move", inDialog: false };
        break;
      }
      stuck = 0;
      if (seen.has(p.selector)) {
        // Wrapped. Back to the first stop is a normal cycle; back to a later one is a trap.
        const at = seen.get(p.selector);
        if (at > 0) {
          const inDialog = await page.evaluate((sels) => sels.every((s) => { const e = document.querySelector(s); return !!(e && e.closest('dialog[open],[aria-modal="true"]')); }), stops.slice(at).map((c) => c.selector));
          trap = { selector: p.selector, kind: "cycle", cycleLength: stops.length - at, inDialog };
        }
        break;
      }
      let aria = "";
      try { aria = (await page.locator(":focus").ariaSnapshot({ timeout: 1000 })).split("\n")[0]; } catch { /* focus moved or element detached */ }
      const m = /^- ([\w-]+)(?: "((?:[^"\\]|\\.)*)")?/.exec(aria);
      p.role = m ? m[1] : null;
      p.name = m && m[2] !== undefined ? m[2].slice(0, 60) : "";
      seen.set(p.selector, stops.length);
      stops.push(p);
      last = p;
    }
    const ROLES = /^(button|link|textbox|checkbox|radio|combobox|switch|slider|spinbutton|searchbox|menuitem|tab|img|option)$/;
    let unnamed = [];
    try {
      const tree = await page.locator("body").ariaSnapshot({ timeout: 5000 });
      const counts = {};
      for (const line of tree.split("\n")) {
        const mm = /^\s*- ([\w-]+)(?=:|\s*$| \[)/.exec(line);
        if (mm && ROLES.test(mm[1])) counts[mm[1]] = (counts[mm[1]] || 0) + 1;
      }
      unnamed = Object.entries(counts).map(([role, count]) => ({ role, count }));
    } catch { unnamed = null; }
    const pick = (s) => ({ selector: s.selector, role: s.role, name: s.name });
    return {
      stops: stops.length,
      complete: (!trap || trap.inDialog) && stops.length < maxStops && Date.now() - started < timeMs,
      trap,
      noVisibleFocus: stops.filter((s) => !s.visibleChange).map(pick),
      obscured: stops.filter((s) => s.obscured === "entirely" || s.obscured === "partly").map((s) => ({ ...pick(s), obscured: s.obscured })),
      positiveTabindex: stops.filter((s) => Number(s.tabindex) > 0).map((s) => ({ ...pick(s), tabindex: Number(s.tabindex) })),
      unnamedFocusable: stops.filter((s) => s.role && ROLES.test(s.role) && !s.name).map(pick),
      unnamed,
      order: stops.map((s) => `${s.role || "?"} "${s.name}" ${s.selector}`),
    };
  } finally {
    await page.evaluate(([x, y]) => { const a = document.activeElement; if (a && a.blur) a.blur(); scrollTo(x, y); }, scroll);
    if (opts.width && vp) await page.setViewportSize(vp);
  }
}
