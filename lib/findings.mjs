// Turns runner output into findings with stable ids, and diffs findings against a baseline.
// The CLI uses this; the skill reads runner output directly and applies its own Impact rules.
//
// Severity (CLI only; the review's Impact tags are decided by SKILL.md, not here):
//   fail  measured and not exempt: contrast below WCAG 1.4.3 (not disabled), a target under 24 px with
//         no spacing exception (2.5.8, not disabled), a focusable control with no accessible name
//         (4.1.2), a keyboard trap outside a modal dialog (2.1.2), focus entirely hidden by fixed or
//         sticky content (2.4.11).
//   warn  heuristic or advisory: under 44 px (Apple's goal), no visible focus change (2.4.7, style
//         diff), positive tabindex, stress-mode clipping, overflow and page scroll, text that does not
//         grow with the root font size.
//   Unmeasurable contrast, template tells, type, motion and logical properties are not findings here:
//   they need judgement.
import { createHash } from "node:crypto";

const hash = (s) => createHash("sha1").update(s).digest("hex").slice(0, 12);
const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const combo = (r) => `${r.width}/${r.colorScheme}/${r.reducedMotion}`;

// measure: the measure-runner's { full: true } output (one result per combination).
// interact: interact-runner output. stress: stress-runner output.
export function toFindings({ measure = [], interact = null, stress = [] } = {}) {
  const byKey = new Map();
  // Distinct elements that share a key (two unnamed icon buttons in one toolbar) stay separate
  // findings: within one run (a combination, a stress mode, or the keyboard walk), the n-th distinct
  // element with a key gets "#n". The same element in other combinations gets the same n when the page
  // keeps its order, so it still merges into one finding.
  const occ = new Map();
  const add = (f, key, where) => {
    const base = `${f.rule}|${key}`, scope = `${where || "walk"}|${base}`;
    if (!occ.has(scope)) occ.set(scope, new Map());
    const els = occ.get(scope);
    if (!els.has(f.selector)) els.set(f.selector, els.size);
    const n = els.get(f.selector);
    const k = n ? `${base}#${n}` : base;
    if (!byKey.has(k)) byKey.set(k, { ...f, key: k, in: [] });
    const g = byKey.get(k);
    if (where && !g.in.includes(where)) g.in.push(where);
  };
  for (const r of measure) {
    const where = combo(r);
    for (const c of r.contrast || []) {
      if (c.status !== "fail" || c.disabled) continue;
      add({ rule: "contrast", sc: "1.4.3", severity: "fail", selector: c.selector,
        detail: `${c.ratio}:1 ${c.fg} on ${c.bg}, ${c.size}px${c.large ? " large" : ""}, needs ${c.large ? 3 : 4.5}:1`, text: c.text },
      `${norm(c.text)}|${c.fg}|${c.bg}`, where);
    }
    for (const t of r.targets || []) {
      if (t.disabled) continue;
      if (t.under24 && !t.spacingOk)
        add({ rule: "target-size", sc: "2.5.8", severity: "fail", selector: t.selector, detail: `${t.width}x${t.height} ${t.role}, no 24 px spacing`, text: t.label }, `${t.role}|${norm(t.label)}`, where);
      else if (t.under44)
        add({ rule: "target-goal", sc: "Apple 44 pt", severity: "warn", selector: t.selector, detail: `${t.width}x${t.height} ${t.role}, under the 44 px goal`, text: t.label }, `${t.role}|${norm(t.label)}`, where);
    }
  }
  if (interact) {
    for (const s of interact.unnamedFocusable || [])
      add({ rule: "name", sc: "4.1.2", severity: "fail", selector: s.selector, detail: `focusable ${s.role} with no accessible name` }, `${s.role}|${s.anchor ?? ""}`);
    for (const t of interact.traps || (interact.trap ? [interact.trap] : []))
      if (!t.inDialog)
        add({ rule: "keyboard-trap", sc: "2.1.2", severity: "fail", selector: t.selector, detail: t.kind === "cycle" ? `Tab cycles inside ${t.cycleLength} elements and cannot leave` : "focus does not move on Tab" }, `${t.kind}|${t.anchor ?? ""}`);
    for (const s of interact.obscured || [])
      add(s.obscured === "entirely"
        ? { rule: "focus-obscured", sc: "2.4.11", severity: "fail", selector: s.selector, detail: "focused control entirely hidden by fixed or sticky content", text: s.name }
        : { rule: "focus-partly-obscured", sc: "2.4.12", severity: "warn", selector: s.selector, detail: "focused control partly hidden by fixed or sticky content", text: s.name },
      `${s.role}|${norm(s.name)}`);
    for (const s of interact.noVisibleFocus || [])
      add({ rule: "focus-visible", sc: "2.4.7", severity: "warn", selector: s.selector, detail: "no visible style change on focus (element or two ancestors)", text: s.name }, `${s.role}|${norm(s.name)}`);
    // Unnamed controls the walk did not reach (disabled, or a role on an element that takes no focus):
    // counted per role from the page's aria snapshot, which has no selectors, so warn level.
    for (const u of interact.unnamed || []) {
      const reached = (interact.unnamedFocusable || []).filter((s) => s.role === u.role).length;
      if (u.role !== "img" && u.count > reached)
        add({ rule: "name-unreached", sc: "4.1.2", severity: "warn", selector: "(aria snapshot)", detail: `${u.count - reached} ${u.role} with no accessible name outside the Tab order (disabled or not focusable); find them in the aria snapshot` }, u.role);
    }
    for (const s of interact.positiveTabindex || [])
      add({ rule: "positive-tabindex", sc: "2.4.3", severity: "warn", selector: s.selector, detail: `tabindex=${s.tabindex}`, text: s.name }, `${s.role}|${norm(s.name)}`);
  }
  for (const r of stress) {
    const where = `${r.mode}@${r.width}`;
    for (const p of r.problems || []) {
      if (p.kind === "page-scroll")
        add({ rule: `${r.mode}-page-scroll`, sc: r.mode === "reflow" ? "1.4.10" : "stress", severity: "warn", selector: (p.examples || [])[0] || "html", detail: `page ${p.scrollWidth}px wide at ${p.viewport}px: ${(p.examples || []).join(", ")}` }, "page", where);
      else
        add({ rule: `${r.mode}-${p.kind}`, sc: { spacing: "1.4.12", reflow: "1.4.10", text200: "1.4.4" }[r.mode] || "stress", severity: "warn", selector: p.selector, detail: `${p.kind}${p.axis ? ` (${p.axis})` : ""} under ${r.mode}`, text: p.text }, `${p.kind}|${norm(p.text)}`, where);
    }
    for (const n of r.notes || [])
      if (n.kind === "text-did-not-grow")
        add({ rule: "text-fixed-px", sc: "1.4.4", severity: "warn", selector: "(page)", detail: `${n.count} of ${n.of} text elements did not grow at 200% root size: ${n.examples.join("; ")}` }, "page", where);
  }
  // Ids come from the key (rule, role, text, colours, or the nearest id or landmark), never from the
  // nth-of-type selector, so inserting an element before another does not make a new finding.
  return [...byKey.values()].map(({ key, ...f }) => ({ id: `${f.rule}-${hash(key)}`, ...f, in: f.in.length ? f.in : undefined })).sort((a, b) => (a.severity === b.severity ? a.rule.localeCompare(b.rule) : a.severity === "fail" ? -1 : 1));
}

export function diff(current, baseline) {
  const old = new Map((baseline?.findings || []).map((f) => [f.id, f]));
  const now = new Map(current.map((f) => [f.id, f]));
  return {
    new: current.filter((f) => !old.has(f.id)),
    still: current.filter((f) => old.has(f.id)),
    fixed: [...old.values()].filter((f) => !now.has(f.id)),
  };
}

// Page-controlled text goes into markdown. Control characters and line separators become spaces, the
// text is capped, and every ASCII punctuation character is backslash-escaped (valid CommonMark for all
// of them), so it cannot open headings, tables, links, autolinks (":" and "." are escaped), images or HTML.
const flat = (s, cap) => { const t = String(s ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " "); return t.length > cap ? t.slice(0, cap - 1) + "…" : t; };
export const mdEscape = (s, cap = 300) => flat(s, cap).replace(/[!-/:-@[-`{-~]/g, (c) => `\\${c}`);
// For a selector shown as a code span: no backticks, no pipes (they end a table cell even in code), capped.
export const mdCode = (s, cap = 160) => "`" + flat(s, cap).replace(/`/g, "'").replace(/\\/g, "\\\\").replace(/\|/g, "\\|") + "`";
