import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { chromium } from "playwright";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const skillDir = fileURLToPath(new URL("..", import.meta.url));
let browser, page;
before(async () => { browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1024, height: 700 } }); });
after(() => browser.close());

async function stress(fixture, opts = {}) {
  await page.setContent(read(`./fixtures/${fixture}.html`));
  const code = `async (page) => (${read("../scripts/stress-runner.js")})(page, ${JSON.stringify({ skillDir, ...opts })})`;
  return JSON.parse(JSON.stringify(await vm.runInContext("(" + code + ")", vm.createContext({ page }))(page)));
}
const run = (out, mode, width) => out.find((r) => r.mode === mode && (!width || r.width === width));

test("stress: reflow at 320 finds the fixed-width panel, not the data table", async () => {
  const out = await stress("stress", { modes: ["reflow"] });
  const scroll = run(out, "reflow", 320).problems.find((p) => p.kind === "page-scroll");
  assert.ok(scroll, "page-scroll reported");
  assert.match(scroll.examples.join(), /#wide/);
  assert.doesNotMatch(scroll.examples.join(), /table/);
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
