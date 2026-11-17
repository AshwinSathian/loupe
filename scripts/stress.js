// Stress the page for one mode, report only the problems that mode introduced, then undo it. A single
// async function expression: evaluate `(<text>)("<mode>")` from page.evaluate or browser_evaluate. It
// defines no globals and reverts its own change before returning (adopted sheets removed, text restored,
// dir restored). scripts/stress-runner.js runs every mode and handles the viewport.
// Modes:
//   reflow   no change here: run it at a 320 px wide viewport. Reports horizontal page scroll and the
//            outermost elements that stick out (WCAG 1.4.10), except 2D content WCAG exempts (tables,
//            maps, code, media, canvas, svg, grids, toolbars).
//   spacing  WCAG 1.4.12 text spacing (line height 1.5, letters 0.12em, words 0.16em, paragraphs 2em),
//            as an adopted stylesheet on the document and every open shadow root (CSP does not govern it).
//   text200  root font size 200%. Advisory: WCAG 1.4.4 is usually met by browser zoom, which this is not.
//            Also lists text that did not grow, because it is set in px and ignores the user's font size.
//   pseudo   visible text nodes get accented letters, brackets and 40% more length.
//   rtl      dir="rtl" on <html>.
// Problems (each warn-level, never a Blocker on its own): "clipped" (overflow hidden or clip, or an
// ellipsis, cutting text), "overflows" (text running past its own box), "page-scroll" (document wider than
// the viewport). Only problems absent before the change are listed.
async (mode) => {
  const CAP = 40;
  const clip = (s, n = 50) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  const roots = [document];
  for (let i = 0; i < roots.length; i++) for (const el of roots[i].querySelectorAll("*")) if (el.shadowRoot) roots.push(el.shadowRoot);
  const all = () => roots.flatMap((r) => [...r.querySelectorAll("*")]);
  const sel = (e) => {
    const parts = [];
    for (let n = e; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
      if (n.id) { parts.unshift(`#${CSS.escape(n.id)}`); break; }
      const sib = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
      parts.unshift(sib.length > 1 ? `${n.tagName.toLowerCase()}:nth-of-type(${sib.indexOf(n) + 1})` : n.tagName.toLowerCase());
    }
    return parts.join(" > ");
  };
  const EXEMPT = "table,pre,code,kbd,samp,canvas,video,iframe,svg,img,picture,map,[role=grid],[role=toolbar],[role=img],[role=application],script,style,noscript,template";
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const textOf = (el) => clip((el.innerText || el.textContent || "").trim().replace(/\s+/g, " "));
  const scan = () => {
    const out = new Map();
    for (const el of all()) {
      if (out.size >= CAP * 3 || el.closest(EXEMPT) || !visible(el)) continue;
      const t = textOf(el);
      if (!t) continue;
      const s = getComputedStyle(el);
      const hidX = /hidden|clip/.test(s.overflowX), hidY = /hidden|clip/.test(s.overflowY);
      if ((hidX || s.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 1) out.set(sel(el), { kind: "clipped", axis: "x", text: t });
      else if (hidY && el.scrollHeight > el.clientHeight + 1) out.set(sel(el), { kind: "clipped", axis: "y", text: t });
      else if (ownText(el) && s.overflowX === "visible" && s.display !== "inline" && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2) out.set(sel(el), { kind: "overflows", text: t });
    }
    return out;
  };
  const frames = () => new Promise((done) => { const t = setTimeout(done, 300); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); done(); })); });

  const se = document.scrollingElement || document.documentElement;
  const scrolled = () => se.scrollWidth > innerWidth + 1;
  const before = mode === "reflow" ? new Map() : scan();
  const scrolledBefore = mode === "reflow" ? false : scrolled();
  const notes = [];
  const undo = [];
  try {
    if (mode === "spacing" || mode === "text200") {
      const css = mode === "spacing"
        ? "*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}"
        : "html{font-size:200%!important}";
      const sizes = mode === "text200" ? new Map(all().filter((e) => ownText(e) && visible(e)).map((e) => [e, parseFloat(getComputedStyle(e).fontSize)])) : null;
      for (const r of roots) {
        const sh = new CSSStyleSheet();
        sh.replaceSync(css);
        r.adoptedStyleSheets = [...r.adoptedStyleSheets, sh];
        undo.push(() => { r.adoptedStyleSheets = r.adoptedStyleSheets.filter((x) => x !== sh); });
      }
      await frames();
      if (sizes) {
        const fixed = [...sizes].filter(([e, px]) => e.isConnected && parseFloat(getComputedStyle(e).fontSize) < px * 1.5);
        if (fixed.length) notes.push({ kind: "text-did-not-grow", count: fixed.length, of: sizes.size, examples: fixed.slice(0, 5).map(([e, px]) => `${sel(e)} (${px}px): "${textOf(e)}"`) });
      }
    } else if (mode === "pseudo") {
      const MAP = { a: "å", e: "é", i: "î", o: "ö", u: "ü", A: "Å", E: "É", I: "Î", O: "Ö", U: "Ü", c: "ç", n: "ñ", y: "ý" };
      const nodes = [];
      for (const r of roots) {
        const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
        for (let t = w.nextNode(); t; t = w.nextNode()) {
          const p = t.parentElement;
          if (t.nodeValue.trim() && p && !p.closest(EXEMPT + ",[aria-hidden=true]")) nodes.push(t);
        }
      }
      for (const t of nodes) {
        const s = t.nodeValue, core = s.trim();
        undo.push(() => { t.nodeValue = s; });
        // Padding in 5-character words, so it wraps as translated text would; one unbreakable run of
        // padding would overflow narrow boxes no real translation overflows.
        const pad = "~".repeat(Math.max(1, Math.round(core.length * 0.4))).replace(/(~{5})(?=~)/g, "$1 ");
        t.nodeValue = s.replace(core, `[${core.replace(/[aeiouAEIOUcny]/g, (ch) => MAP[ch])} ${pad}]`);
      }
      notes.push({ kind: "text-nodes-changed", count: nodes.length });
      await frames();
    } else if (mode === "rtl") {
      const html = document.documentElement, had = html.getAttribute("dir");
      html.setAttribute("dir", "rtl");
      undo.push(() => (had === null ? html.removeAttribute("dir") : html.setAttribute("dir", had)));
      await frames();
    } else if (mode !== "reflow") throw new Error(`unknown mode ${mode}`);

    const after = scan();
    const problems = [...after].filter(([k]) => !before.has(k)).slice(0, CAP).map(([selector, v]) => ({ selector, ...v }));
    if (scrolled() && !scrolledBefore) {
      const out = all().filter((el) => !el.closest(EXEMPT) && visible(el) && getComputedStyle(el).position !== "fixed" && el.getBoundingClientRect().right > innerWidth + 1);
      const outer = out.filter((el) => !out.includes(el.parentElement));
      // Only exempt 2D content (a data table, code, media) sticks out: WCAG 1.4.10 allows that scroll.
      if (outer.length) problems.unshift({ kind: "page-scroll", scrollWidth: se.scrollWidth, viewport: innerWidth, examples: outer.slice(0, 5).map((el) => `${sel(el)} (right edge ${Math.round(el.getBoundingClientRect().right)}px)`) });
    }
    return { mode, width: innerWidth, problems, notes };
  } finally {
    for (const f of undo.reverse()) f();
  }
}
