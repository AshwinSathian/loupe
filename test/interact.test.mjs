import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { chromium } from "playwright";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
let browser, page;
before(async () => { browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1024, height: 700 } }); });
after(() => browser.close());

// Run the way Playwright MCP's browser_run_code_unsafe does: a vm context holding only `page`.
async function walk(fixture, opts = {}) {
  await page.setContent(read(`./fixtures/${fixture}.html`));
  const code = `async (page) => (${read("../scripts/interact-runner.js")})(page, ${JSON.stringify(opts)})`;
  // JSON round trip: arrays made in the vm context have another realm's prototype.
  return JSON.parse(JSON.stringify(await vm.runInContext("(" + code + ")", vm.createContext({ page }))(page)));
}
const sels = (list) => list.map((x) => x.selector || x);

test("interact: no ring, positive tabindex, unnamed icon button, focus under a fixed footer", async () => {
  const r = await walk("focus");
  assert.deepEqual(sels(r.noVisibleFocus), ["#none"]);
  assert.deepEqual(r.positiveTabindex.map((x) => [x.selector, x.tabindex]), [["#jump", 3]]);
  assert.deepEqual(r.unnamed, [{ role: "button", count: 1 }]);
  assert.deepEqual(r.unnamedFocusable, [{ selector: "#icon", role: "button", name: "" }]);
  assert.deepEqual(r.obscured, [{ selector: "#under", role: "link", name: "Under footer", obscured: "entirely" }]);
  assert.equal(r.trap, null);
  assert.equal(r.complete, true);
  assert.equal(await page.evaluate(() => document.activeElement === document.body), true);
});

test("interact: a widget that swallows Tab is a trap, and the walk continues past it", async () => {
  const r = await walk("trap");
  assert.equal(r.trap.kind, "cycle");
  assert.equal(r.trap.inDialog, false);
  assert.equal(r.trap.walkContinued, true);
  assert.ok(r.order.some((o) => o.endsWith("#after")), r.order.join("\n"));
  assert.equal(r.traps.length, 1);
});

test("interact: a blur handler that pulls focus back on a timer is a trap; unreached unnamed fields are counted", async () => {
  const r = await walk("trap-timer");
  assert.equal(r.trap?.selector, "#b", JSON.stringify(r.trap));
  assert.deepEqual(r.unnamed, [{ role: "textbox", count: 1 }]);
});

test("interact: focus cycling inside an open modal dialog is not a trap", async () => {
  const r = await walk("dialog");
  assert.equal(r.trap?.inDialog ?? true, true, JSON.stringify(r.trap));
  assert.deepEqual(r.order.map((o) => o.split(" ").pop()), ["#d1", "#d2"]);
  assert.equal(r.complete, true);
});

test("interact: a ring drawn by :focus-within on the parent counts as visible", async () => {
  const r = await walk("focus-within");
  assert.deepEqual(r.noVisibleFocus, []);
});

test("interact: width option is applied for the walk and the viewport restored", async () => {
  await walk("focus-clean", { width: 400 });
  assert.equal(page.viewportSize().width, 1024);
});

test("interact: a clean page reports nothing", async () => {
  const r = await walk("focus-clean");
  assert.equal(r.stops, 4);
  assert.deepEqual([r.noVisibleFocus, r.obscured, r.unnamedFocusable, r.positiveTabindex], [[], [], [], []]);
  assert.deepEqual(r.unnamed, []);
  assert.equal(r.trap, null);
});
