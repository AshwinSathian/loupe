import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runScript } from "../lib/runner.mjs";
import { chromium } from "playwright";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const skillDir = fileURLToPath(new URL("..", import.meta.url));
let browser, page;
before(async () => { browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1024, height: 700 } }); });
after(() => browser.close());

async function stress(fixture, opts = {}) {
  await page.setContent(read(`./fixtures/${fixture}.html`));
  return runScript("stress-runner.js", page, opts);
}
const run = (out, mode, width) => out.find((r) => r.mode === mode && (!width || r.width === width));

test("stress: reflow at 320 finds the fixed-width panel, not the data table", async () => {
  const out = await stress("stress", { modes: ["reflow"] });
  const scroll = run(out, "reflow", 320).problems.find((p) => p.kind === "page-scroll");
  assert.ok(scroll, "page-scroll reported");
  assert.match(scroll.examples.join(), /#wide/);
  assert.doesNotMatch(scroll.examples.join(), /table/);
});

test("stress: only a wide data table sticking out at 320 is not a reflow failure", async () => {
  await page.setContent('<style>body{margin:0}table{width:900px}</style><p>Fluid text</p><table><tr><td>Wide data</td></tr></table>');
  const src = read("../scripts/stress.js");
  await page.setViewportSize({ width: 320, height: 700 });
  const out = await page.evaluate(`(${src})("reflow")`);
  await page.setViewportSize({ width: 1024, height: 700 });
  assert.deepEqual(out.problems, []);
});

test("stress: right-to-left overflow to the left is reported; $& in text survives pseudo", async () => {
  await page.setContent('<style>body{margin:0}#w{margin-left:-300px}</style><p id="w">Wide in RTL</p><p id="d">Costs $& and $1</p>');
  const src = read("../scripts/stress.js");
  await page.setViewportSize({ width: 390, height: 700 });
  const rtl = await page.evaluate(`(${src})("rtl")`);
  const pseudo = await page.evaluate(`(${src})("pseudo")`);
  await page.setViewportSize({ width: 1024, height: 700 });
  assert.deepEqual(rtl.problems.find((p) => p.kind === "page-scroll")?.examples, ["#w (left edge -300px)"]);
  assert.equal(await page.evaluate(() => document.getElementById("d").textContent), "Costs $& and $1");
  assert.ok(pseudo.notes[0].count >= 2);
});

test("stress: pseudo-localization clips the ellipsis tab; text is restored", async () => {
  const html = await page.setContent(read("./fixtures/stress.html")).then(() => page.content());
  const out = await stress("stress", { modes: ["pseudo"], widths: [1024] });
  assert.ok(run(out, "pseudo").problems.some((p) => p.selector === "#tab" && p.kind === "clipped"));
  assert.equal(await page.content(), html);
});

test("stress: text spacing clips the fixed-height box; sheets removed afterwards", async () => {
  const out = await stress("stress", { modes: ["spacing"], widths: [1024] });
  assert.ok(run(out, "spacing").problems.some((p) => p.selector === "#box" && p.kind === "clipped" && p.axis === "y"));
  assert.equal(await page.evaluate(() => document.adoptedStyleSheets.length), 0);
});

test("stress: text200 lists px text that did not grow, not rem text", async () => {
  const out = await stress("stress", { modes: ["text200"], widths: [1024] });
  const note = run(out, "text200").notes.find((n) => n.kind === "text-did-not-grow");
  assert.match(note.examples.join(), /#px/);
  assert.doesNotMatch(note.examples.join(), /#rem/);
});

test("stress: rtl restores dir; a fluid page reports nothing in any mode", async () => {
  const out = await stress("stress-clean");
  assert.equal(out.length, 1 + 4 * 2);
  for (const r of out) assert.deepEqual(r.problems, [], `${r.mode} ${r.width}: ${JSON.stringify(r.problems)}`);
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute("dir")), null);
  assert.deepEqual(page.viewportSize(), { width: 1024, height: 700 });
});

test("stress: selectors inside a shadow root name the host and tell siblings apart", async () => {
  await page.setContent(`<x-tabs id="t"></x-tabs><script>customElements.define("x-tabs", class extends HTMLElement { constructor() { super(); this.attachShadow({ mode: "open" }).innerHTML = "<style>span{display:inline-block;width:40px;white-space:nowrap;overflow:hidden}</style><span>Alpha tab</span><span>Beta tab</span>"; } });</script>`);
  const out = await page.evaluate(`(${read("../scripts/stress.js")})("reflow")`);
  const sels = out.problems.map((p) => p.selector).sort();
  assert.deepEqual(sels, ["#t >>> span:nth-of-type(1)", "#t >>> span:nth-of-type(2)"]);
});
