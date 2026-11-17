import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toFindings, diff, mdEscape } from "../lib/findings.mjs";

const fixtures = new URL("./fixtures/", import.meta.url);
let server, base;
before(async () => {
  server = createServer((req, res) => {
    try { res.end(readFileSync(new URL("." + new URL(req.url, "http://x").pathname, fixtures))); }
    catch { res.statusCode = 404; res.end(); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const cli = (...args) => new Promise((resolve) => {
  execFile(process.execPath, [new URL("../bin/loupe.mjs", import.meta.url).pathname, ...args], { timeout: 120000 }, (err, stdout, stderr) =>
    resolve({ code: err ? err.code : 0, stdout, stderr }));
});

test("cli: fails on measured problems, escapes page text, writes JSON", async () => {
  const dir = mkdtempSync(join(tmpdir(), "loupe-cli-"));
  const r = await cli(`${base}/cli.html`, "--only", "measure,interact", "--widths", "1440", "--json", join(dir, "out.json"));
  assert.equal(r.code, 1, r.stderr);
  assert.match(r.stdout, /\| fail \| 1\.4\.3 \|/);
  // A lone 16 px button passes 2.5.8 by the spacing exception: warn against Apple's goal, not fail.
  assert.match(r.stdout, /\| warn \| Apple 44 pt \| 16x16 button/);
  assert.match(r.stdout, /\| fail \| 4\.1\.2 \|/);
  assert.match(r.stdout, /\| fail \| 2\.4\.11 \|/);
  assert.doesNotMatch(r.stdout, /\n## Fake/);
  assert.doesNotMatch(r.stdout, /!\[x\]\(/);
  const out = JSON.parse(readFileSync(join(dir, "out.json"), "utf8"));
  const f = out.pages[`${base}/cli.html`].findings;
  assert.ok(f.every((x) => /^[a-z0-9-]+-[0-9a-f]{12}$/.test(x.id)));
});

test("cli: baseline then --fail-on new passes; a new problem fails", async () => {
  const dir = mkdtempSync(join(tmpdir(), "loupe-cli-"));
  const bl = join(dir, "baseline.json");
  const w = await cli(`${base}/cli.html`, "--only", "measure", "--widths", "1440", "--baseline", bl, "--update-baseline");
  assert.equal(w.code, 0, w.stderr);
  const again = await cli(`${base}/cli.html`, "--only", "measure", "--widths", "1440", "--baseline", bl);
  assert.equal(again.code, 0, again.stdout + again.stderr);
  assert.match(again.stdout, /0 new, 0 fixed/);
  // A page with a problem the baseline lacks, checked against the same baseline file keyed by URL.
  const b = JSON.parse(readFileSync(bl, "utf8"));
  b.pages[`${base}/cli.html`].findings = b.pages[`${base}/cli.html`].findings.filter((x) => x.rule !== "contrast");
  writeFileSync(bl, JSON.stringify(b));
  const worse = await cli(`${base}/cli.html`, "--only", "measure", "--widths", "1440", "--baseline", bl);
  assert.equal(worse.code, 1);
  assert.match(worse.stdout, /\| new \| fail \| 1\.4\.3 \|/);
});

test("cli: a clean page exits 0; usage errors exit 2", async () => {
  assert.equal((await cli(`${base}/focus-clean.html`, "--only", "measure,interact", "--widths", "1440")).code, 0);
  const file = await cli("file:///etc/hosts");
  assert.equal(file.code, 2);
  assert.match(file.stderr, /--allow-file/);
  assert.equal((await cli("--fail-on", "new", `${base}/cli.html`)).code, 2);
  assert.equal((await cli("javascript:alert(1)")).code, 2);
});

test("findings: ids survive a renumbered selector; diff sorts new, fixed, still", () => {
  const row = (selector, text, fg = "#999999") => ({ selector, text, fg, bg: "#ffffff", ratio: 2.8, size: 16, large: false, status: "fail" });
  const m = (rows) => [{ width: 390, colorScheme: "light", reducedMotion: "reduce", contrast: rows, targets: [] }];
  const a = toFindings({ measure: m([row("ul > li:nth-of-type(2)", "Two")]) });
  const b = toFindings({ measure: m([row("ul > li:nth-of-type(3)", "Two"), row("p", "Other", "#aaaaaa")]) });
  assert.equal(a[0].id, b.find((f) => f.text === "Two").id);
  const d = diff(b, { findings: a });
  assert.deepEqual([d.new.length, d.still.length, d.fixed.length], [1, 1, 0]);
  assert.equal(diff([], { findings: a }).fixed.length, 1);
});

test("findings: disabled, unmeasurable and spacing-exempt rows are not failures", () => {
  const f = toFindings({ measure: [{ width: 390, colorScheme: "light", reducedMotion: "reduce",
    contrast: [{ selector: "a", text: "x", status: "fail", disabled: true }, { selector: "b", text: "y", status: "unmeasurable" }],
    targets: [{ selector: "c", role: "button", label: "", under24: true, under44: true, spacingOk: true }] }] });
  assert.deepEqual(f.map((x) => [x.rule, x.severity]), [["target-goal", "warn"]]);
});

test("findings: markdown escaping neutralises headings, links, images and HTML", () => {
  assert.equal(mdEscape("## a ![i](u) <b>|"), "\\#\\# a \\!\\[i\\]\\(u\\) \\<b\\>\\|");
});

// WebKit and Firefox run when installed (npx playwright install webkit firefox); CI installs Chromium only.
import pw from "playwright";
import { existsSync } from "node:fs";
for (const engine of ["webkit", "firefox"]) {
  const have = (() => { try { return existsSync(pw[engine].executablePath()); } catch { return false; } })();
  test(`cli: ${engine} finds the same keyboard problems`, { skip: !have && `${engine} not installed` }, async () => {
    const r = await cli(`${base}/cli.html`, "--only", "interact", "--browser", engine);
    assert.equal(r.code, 1, r.stderr);
    assert.match(r.stdout, /\| fail \| 2\.4\.11 \|/);
    assert.match(r.stdout, /\| fail \| 4\.1\.2 \|/);
    assert.doesNotMatch(r.stdout, /2\.1\.2/);
  });
}
