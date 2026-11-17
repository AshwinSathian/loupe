// Mutation eval for loupe's measurement engine. Run: npm run eval:mutation
// Patches evals/mutation/base.html with each operator in operators.json, runs the measure, interact and
// stress runners exactly as the CLI does, and scores: a defect counts as detected when its rule appears
// at the expected severity; a decoy counts as clean when its rule is absent. The base page must be clean.
// This measures the engine against defects with known thresholds, not the quality of a review.
// Writes evals/mutation/result.json and prints a table. Fails (exit 2) if the operator or base files no
// longer match operators.sha256.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { runScript } from "../../lib/runner.mjs";
import { chromium } from "playwright";
import { toFindings } from "../../lib/findings.mjs";

const here = new URL("./", import.meta.url);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f) => readFileSync(new URL(f, here), "utf8");
for (const line of read("operators.sha256").trim().split("\n")) {
  const [sum, file] = line.split(/\s+/);
  if (createHash("sha256").update(readFileSync(new URL(file, here))).digest("hex") !== sum) {
    console.error(`${file} changed since operators.sha256 was committed; a new round needs a new sha256 commit first`);
    process.exit(2);
  }
}
const base = read("base.html");
const { operators } = JSON.parse(read("operators.json"));
const patch = (op) => {
  let h = base;
  if (op.replace) { if (!h.includes(op.replace[0])) throw new Error(`${op.id}: replace target missing`); h = h.replace(op.replace[0], op.replace[1]); }
  if (op.css) h = h.replace("</style>", `${op.css}\n</style>`);
  if (op.html) h = h.replace("</body>", `${op.html}\n</body>`);
  if (op.script) h = h.replace("</body>", `<script>${op.script}</script>\n</body>`);
  return h;
};
const runner = (name, page, opts) => runScript(name, page, opts);

const browser = await chromium.launch();
const engine = async (html) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.setContent(html, { waitUntil: "load" });
    return toFindings({
      measure: await runner("measure-runner.js", page, { full: true }),
      interact: await runner("interact-runner.js", page, {}),
      stress: await runner("stress-runner.js", page, {}),
    });
  } finally { await page.close(); }
};
const rows = [];
try {
  const clean = await engine(base);
  rows.push({ id: "base", kind: "base", pass: clean.length === 0, found: clean.map((f) => `${f.rule}:${f.severity}`) });
  for (const op of operators) {
    const f = await engine(patch(op));
    const pass = op.kind === "defect" ? f.some((x) => x.rule === op.expect.rule && x.severity === op.expect.severity) : !f.some((x) => x.rule === op.absent);
    rows.push({ id: op.id, kind: op.kind, rule: op.kind === "defect" ? op.expect.rule : op.absent, pass, found: [...new Set(f.map((x) => `${x.rule}:${x.severity}`))] });
  }
} finally { await browser.close(); }

const defects = rows.filter((r) => r.kind === "defect"), decoys = rows.filter((r) => r.kind === "decoy");
let commit = "unknown";
try { commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }).toString().trim(); } catch { /* not a checkout */ }
const result = {
  date: new Date().toISOString().slice(0, 10), commit, engine: `chromium ${await chromium.launch().then(async (b) => { const v = b.version(); await b.close(); return v; })}`,
  base_clean: rows[0].pass,
  defects: { total: defects.length, detected: defects.filter((r) => r.pass).length },
  decoys: { total: decoys.length, clean: decoys.filter((r) => r.pass).length },
  rows,
};
writeFileSync(new URL("result.json", here), JSON.stringify(result, null, 2) + "\n");
for (const r of rows) console.log(`${r.pass ? "ok  " : "MISS"} ${r.kind.padEnd(6)} ${r.id.padEnd(22)} ${r.rule || ""}  [${r.found.join(", ")}]`);
console.log(`base clean: ${result.base_clean}; defects detected ${result.defects.detected}/${result.defects.total}; decoys clean ${result.decoys.clean}/${result.decoys.total}`);
