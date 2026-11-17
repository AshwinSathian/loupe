// Outside check for loupe's measurement engine: the W3C ACT Rules test cases, written by the ACT Rules
// Community Group, not by loupe. Run: npm run eval:act  (needs network; nothing is saved but the result)
// For each ACT rule that maps to an engine rule, loads every approved test case from w3.org in Chromium,
// runs the runner that rule needs, and scores: a "failed" case counts as caught when the engine reports the
// mapped rule (any severity); a "passed" or "inapplicable" case counts as a false alarm when it does.
// Writes evals/act/result.json. The test cases are fetched at run time and not vendored (W3C licence).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { runScript } from "../../lib/runner.mjs";
import { chromium } from "playwright";
import { toFindings } from "../../lib/findings.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const INDEX = "https://www.w3.org/WAI/content-assets/wcag-act-rules/testcases.json";
const RULES = {
  "97a4e1": { engine: "name", run: "interact" },
  "c487ae": { engine: "name", run: "interact" },
  "e086e5": { engine: "name", run: "interact" },
  "59796f": { engine: "name", run: "interact" },
  "m6b1q3": { engine: "name", run: "interact" },
  "2t702h": { engine: "name", run: "interact" },
  "afw4f7": { engine: "contrast", run: "measure" },
  "80af7b": { engine: "keyboard-trap", run: "interact" },
  "a1b64e": { engine: "keyboard-trap", run: "interact" },
  "oj04fd": { engine: "focus-visible", run: "interact" },
  "59br37": { engine: "text200-clipped", run: "stress" },
};
const res = await fetch(INDEX);
if (!res.ok) { console.error(`cannot fetch ${INDEX}: ${res.status}`); process.exit(2); }
const index = await res.json();
const cases = index.testcases.filter((t) => RULES[t.ruleId] && t.approved !== false && /^https:\/\/www\.w3\.org\//.test(t.url));

const runner = (name, page, opts) => runScript(name, page, opts);
const browser = await chromium.launch();
const rows = [];
try {
  for (const t of cases) {
    const rule = RULES[t.ruleId];
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    let found = null, error = null;
    try {
      await page.goto(t.url, { waitUntil: "load", timeout: 30000 });
      const raw = {};
      if (rule.run === "measure") raw.measure = await runner("measure-runner.js", page, { full: true, widths: [1280] });
      if (rule.run === "interact") raw.interact = await runner("interact-runner.js", page, { maxStops: 40, timeMs: 8000 });
      if (rule.run === "stress") raw.stress = await runner("stress-runner.js", page, { modes: ["text200"], widths: [1280] });
      found = toFindings(raw).some((f) => f.rule === rule.engine || (rule.engine === "name" && f.rule === "name-unreached"));
    } catch (e) { error = e.message.split("\n")[0]; }
    finally { await page.close(); }
    rows.push({ rule: t.ruleId, name: t.ruleName, engine: rule.engine, title: t.testcaseTitle, url: t.url, expected: t.expected, found, error });
  }
} finally { await browser.close(); }

const by = {};
for (const r of rows) {
  const s = (by[r.rule] ||= { name: r.name, engine: r.engine, failed: 0, caught: 0, notFailed: 0, falseAlarms: 0, errors: 0 });
  if (r.error) { s.errors++; continue; }
  if (r.expected === "failed") { s.failed++; if (r.found) s.caught++; }
  else { s.notFailed++; if (r.found) s.falseAlarms++; }
}
const sum = (k) => Object.values(by).reduce((n, s) => n + s[k], 0);
let commit = "unknown";
try { commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }).toString().trim(); } catch { /* not a checkout */ }
const result = {
  date: new Date().toISOString().slice(0, 10), commit, source: INDEX, cases: rows.length,
  totals: { failed: sum("failed"), caught: sum("caught"), notFailed: sum("notFailed"), falseAlarms: sum("falseAlarms"), errors: sum("errors") },
  rules: by,
  misses: rows.filter((r) => !r.error && r.expected === "failed" && !r.found).map(({ rule, title, url }) => ({ rule, title, url })),
  falseAlarms: rows.filter((r) => !r.error && r.expected !== "failed" && r.found).map(({ rule, title, expected, url }) => ({ rule, title, expected, url })),
  errors: rows.filter((r) => r.error).map(({ rule, title, error }) => ({ rule, title, error })),
};
writeFileSync(new URL("result.json", import.meta.url), JSON.stringify(result, null, 2) + "\n");
for (const [id, s] of Object.entries(by)) console.log(`${id} ${s.name.padEnd(52)} caught ${s.caught}/${s.failed}  false alarms ${s.falseAlarms}/${s.notFailed}${s.errors ? `  errors ${s.errors}` : ""}`);
console.log(`total: caught ${result.totals.caught}/${result.totals.failed} failed cases; false alarms ${result.totals.falseAlarms}/${result.totals.notFailed}`);
