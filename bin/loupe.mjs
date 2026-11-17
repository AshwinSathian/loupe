#!/usr/bin/env node
// loupe CLI: runs loupe's measurement scripts on one or more pages without a model.
// Usage: loupe [measure] <url>... [options]; `loupe --help` lists the options.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { platform, arch } from "node:os";
import vm from "node:vm";
import { toFindings, diff, mdEscape } from "../lib/findings.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const HELP = `loupe ${VERSION}: measure pages the way a loupe review does, without a model.

Usage: loupe [measure] <url>... [options]

  --only <list>          measure,interact,stress (default: all three)
  --widths <list>        widths for measure and stress (default: measure 390,820,1440; stress 390,1440)
  --browser <name>       chromium (default), webkit or firefox
  --storage-state <file> Playwright storage state for pages behind a sign-in
  --wait-for <selector>  wait for this selector after load, before measuring
  --timeout <ms>         navigation timeout (default 30000)
  --json <file>          write every finding and the raw summary as JSON
  --md <file>            write the markdown summary to a file (default: stdout)
  --baseline <file>      compare with a baseline; report new, fixed and still-present findings
  --update-baseline      write the current findings to --baseline and exit 0
  --fail-on <level>      new (default with --baseline), any (default without), none
  --allow-file           allow file: URLs (off by default)
  -h, --help, -v, --version

Exit codes: 0 pass, 1 findings at the --fail-on level, 2 usage, load or browser error.
Only measured, non-exempt problems are "fail"; heuristics are "warn" and never fail a run.
Run baselines and checks on the same machine image: fonts change text widths and target sizes.`;

const die = (msg) => { process.stderr.write(`loupe: ${msg}\n`); process.exit(2); };
let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      only: { type: "string" }, widths: { type: "string" }, browser: { type: "string", default: "chromium" },
      "storage-state": { type: "string" }, "wait-for": { type: "string" }, timeout: { type: "string", default: "30000" },
      json: { type: "string" }, md: { type: "string" }, baseline: { type: "string" }, "update-baseline": { type: "boolean" },
      "fail-on": { type: "string" }, "allow-file": { type: "boolean" },
      help: { type: "boolean", short: "h" }, version: { type: "boolean", short: "v" },
    },
  });
} catch (e) { die(`${e.message}\n\n${HELP}`); }
const o = args.values;
if (o.help) { console.log(HELP); process.exit(0); }
if (o.version) { console.log(VERSION); process.exit(0); }
const urls = args.positionals[0] === "measure" ? args.positionals.slice(1) : args.positionals;
if (!urls.length) die(`no URL given\n\n${HELP}`);
for (const u of urls) {
  let p;
  try { p = new URL(u); } catch { die(`not a URL: ${u}`); }
  if (p.protocol === "file:" && !o["allow-file"]) die(`file: URLs need --allow-file: ${u}`);
  if (!["http:", "https:", "file:"].includes(p.protocol)) die(`only http, https and file URLs: ${u}`);
}
const only = new Set((o.only || "measure,interact,stress").split(",").map((s) => s.trim()));
for (const s of only) if (!["measure", "interact", "stress"].includes(s)) die(`unknown --only value: ${s}`);
if (!["chromium", "webkit", "firefox"].includes(o.browser)) die(`unknown --browser: ${o.browser}`);
const failOn = o["fail-on"] || (o.baseline ? "new" : "any");
if (!["new", "any", "none"].includes(failOn)) die(`unknown --fail-on: ${failOn}`);
if (o["update-baseline"] && !o.baseline) die("--update-baseline needs --baseline <file>");
if (failOn === "new" && !o.baseline) die("--fail-on new needs --baseline <file>");
const widths = o.widths ? o.widths.split(",").map(Number) : null;
if (widths && widths.some((w) => !(w >= 200 && w <= 4000))) die(`--widths must be numbers from 200 to 4000: ${o.widths}`);

let pw;
try { pw = await import("playwright"); } catch { die("Playwright is not installed. Run: npm install playwright"); }
let browser;
try { browser = await pw[o.browser].launch(); }
catch (e) { die(`could not start ${o.browser}. Install it with: npx playwright install ${o.browser}\n${e.message.split("\n")[0]}`); }

// Runners are read and run the way the skill runs them through Playwright MCP: a vm context holding
// only `page`, the runner text unchanged.
const runner = (name, page, opts) => {
  const code = `async (page) => (${readFileSync(`${ROOT}scripts/${name}`, "utf8")})(page, ${JSON.stringify({ skillDir: ROOT, ...opts })})`;
  return vm.runInContext(`(${code})`, vm.createContext({ page }))(page).then((r) => JSON.parse(JSON.stringify(r)));
};

const env = { tool: `loupe ${VERSION}`, browser: `${o.browser} ${browser.version()}`, playwright: (() => { try { return JSON.parse(readFileSync(`${ROOT}node_modules/playwright/package.json`, "utf8")).version; } catch { return "unknown"; } })(), platform: `${platform()}-${arch()}` };
const pages = {};
let loadError = false;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(o["storage-state"] ? { storageState: o["storage-state"] } : {}) });
  for (const url of urls) {
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "load", timeout: Number(o.timeout) });
      if (o["wait-for"]) await page.waitForSelector(o["wait-for"], { timeout: Number(o.timeout) });
      await page.evaluate(() => document.fonts && document.fonts.ready);
      const raw = {};
      if (only.has("measure")) raw.measure = await runner("measure-runner.js", page, { full: true, ...(widths ? { widths } : {}) });
      if (only.has("interact")) raw.interact = await runner("interact-runner.js", page, { width: 1440 });
      if (only.has("stress")) raw.stress = await runner("stress-runner.js", page, widths ? { widths } : {});
      pages[url] = { findings: toFindings(raw), raw };
    } catch (e) {
      loadError = true;
      pages[url] = { error: e.message.split("\n")[0] };
      process.stderr.write(`loupe: ${url}: ${pages[url].error}\n`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

let base = null;
if (o.baseline && existsSync(o.baseline) && !o["update-baseline"]) {
  try { base = JSON.parse(readFileSync(o.baseline, "utf8")); } catch (e) { die(`cannot read baseline ${o.baseline}: ${e.message}`); }
  for (const k of ["browser", "platform"]) if (base.env && base.env[k] !== env[k]) process.stderr.write(`loupe: baseline ${k} was "${base.env[k]}", now "${env[k]}"; text widths may differ\n`);
} else if (o.baseline && !o["update-baseline"]) process.stderr.write(`loupe: baseline ${o.baseline} not found; every finding counts as new\n`);

if (o["update-baseline"]) {
  if (loadError) die("a page failed to load; baseline not written");
  const out = { version: 1, created: new Date().toISOString(), env, pages: Object.fromEntries(Object.entries(pages).map(([u, p]) => [u, { findings: p.findings.map(({ id, rule, sc, severity, selector, detail }) => ({ id, rule, sc, severity, selector, detail })) }])) };
  writeFileSync(o.baseline, JSON.stringify(out, null, 2) + "\n");
  console.log(`loupe: baseline written to ${o.baseline} (${Object.values(out.pages).reduce((n, p) => n + p.findings.length, 0)} findings)`);
  process.exit(0);
}

// Markdown summary. Every page-controlled string goes through mdEscape.
const lines = [`## loupe ${VERSION}`, "", `${env.browser}, ${env.platform}. Fail = measured and not exempt; warn = heuristic or advisory.`, ""];
let failing = 0;
for (const [url, p] of Object.entries(pages)) {
  lines.push(`### ${mdEscape(url)}`, "");
  if (p.error) { lines.push(`Could not measure: ${mdEscape(p.error)}`, ""); continue; }
  const d = base ? diff(p.findings, base.pages?.[url]) : null;
  const fails = p.findings.filter((f) => f.severity === "fail");
  const counted = failOn === "none" ? [] : failOn === "new" ? (d ? d.new : p.findings).filter((f) => f.severity === "fail") : fails;
  failing += counted.length;
  lines.push(`${fails.length} fail, ${p.findings.length - fails.length} warn` + (d ? `; against the baseline: ${d.new.length} new, ${d.fixed.length} fixed, ${d.still.length} still present` : ""), "");
  const isNew = d ? new Set(d.new.map((f) => f.id)) : null;
  const row = (f) => `| ${isNew ? (isNew.has(f.id) ? "new" : "") + " | " : ""}${f.severity} | ${mdEscape(f.sc)} | ${mdEscape(f.detail)}${f.text ? ` "${mdEscape(f.text)}"` : ""} | \`${String(f.selector).replace(/`/g, "'").replace(/\|/g, "\\|")}\` |`;
  if (p.findings.length) {
    lines.push(isNew ? "| | Severity | Criterion | Finding | Where |" : "| Severity | Criterion | Finding | Where |", isNew ? "|---|---|---|---|---|" : "|---|---|---|---|");
    for (const f of p.findings.slice(0, 60)) lines.push(row(f));
    if (p.findings.length > 60) lines.push("", `and ${p.findings.length - 60} more in the JSON output.`);
    lines.push("");
  }
  if (d && d.fixed.length) lines.push(`Fixed since the baseline: ${d.fixed.map((f) => `${mdEscape(f.sc)} ${mdEscape(f.detail)}`).slice(0, 20).join("; ")}`, "");
}
const md = lines.join("\n");
if (o.md) writeFileSync(o.md, md + "\n"); else console.log(md);
if (o.json) writeFileSync(o.json, JSON.stringify({ env, failOn, pages }, null, 2) + "\n");
process.exit(loadError ? 2 : failing ? 1 : 0);
