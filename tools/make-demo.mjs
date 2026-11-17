// Regenerates docs/media/loupe-demo.gif and loupe-demo.png from a live run of the CLI, so the picture is the
// tool's real output. A maintainer tool, not part of the skill or CI: it needs ffmpeg on the PATH.
// Usage: node tools/make-demo.mjs
// It serves evals/fixtures/keyboard-app on a free local port, runs bin/loupe.mjs against it, and renders the
// command and the findings as a terminal. The findings are the real output. The command shown uses the
// published package name in place of the local bin path and http://localhost:3000/settings as an example URL
// in place of the free port the run used; no finding contains the URL.
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "docs", "media");
const FIXTURE = readFileSync(join(ROOT, "evals/fixtures/keyboard-app/index.html"), "utf8");
const SHOWN_URL = "http://localhost:3000/settings";
const ARGS = ["--only", "measure,interact", "--widths", "1440", "--fail-on", "any"];

const server = createServer((req, res) => { res.setHeader("content-type", "text/html"); res.end(FIXTURE); });
await new Promise((ok, no) => { server.once("error", no); server.listen(0, "127.0.0.1", ok); });
const url = `http://127.0.0.1:${server.address().port}/settings`;
// Async, so this process keeps answering the browser while loupe runs. Exit code 1 (findings) is expected.
const run = await new Promise((done) => execFile(process.execPath, [join(ROOT, "bin/loupe.mjs"), url, ...ARGS], { encoding: "utf8", timeout: 120000, cwd: ROOT }, (err, stdout, stderr) => done({ status: err ? err.code : 0, stdout, stderr })));
server.close();
if (run.status !== 1 && run.status !== 0) throw new Error(`loupe exited ${run.status}: ${run.stderr}`);

// Parse the real markdown summary. Markdown escapes (a backslash before punctuation) are undone for display.
const unesc = (s) => s.replace(/\\([!-/:-@[-`{-~])/g, "$1");
const lines = run.stdout.split("\n");
const counts = /^(\d+) fail, (\d+) warn/m.exec(run.stdout);
if (!counts) throw new Error("no summary line in the CLI output");
const rows = lines.filter((l) => /^\| (fail|warn) \|/.test(l)).map((l) => {
  const c = l.split(/(?<!\\)\|/).map((x) => x.trim());
  return { sev: c[1], sc: unesc(c[2]), text: unesc(c[3]), where: unesc(c[4]).replace(/^`|`$/g, "") };
});
const fails = rows.filter((r) => r.sev === "fail");
const warns = rows.length - fails.length;
const cmd = `npx -y loupe-review@2 ${SHOWN_URL} --only measure,interact`;
const exitLine = `exit ${run.status}`;

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const page = (typed, shown, finale) => `<!doctype html><meta charset=utf-8><style>
*{box-sizing:border-box}body{margin:0;background:#0d1117;font:15px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#e6edf3}
.win{width:960px;height:380px;padding:0;display:flex;flex-direction:column}
.bar{height:34px;background:#161b22;border-bottom:1px solid #30363d;display:flex;align-items:center;gap:7px;padding:0 14px}
.bar i{width:11px;height:11px;border-radius:50%;background:#30363d;display:block}.bar span{margin-left:10px;color:#8b949e;font-size:12px}
.body{padding:18px 22px;overflow:hidden}
.p{color:#7ee787}.dim{color:#8b949e}.fail{color:#ff7b72;font-weight:700}.warn{color:#d29922}.sc{color:#79c0ff}
.row{margin:9px 0 0;display:grid;grid-template-columns:54px 62px 1fr;gap:0 10px}
.where{grid-column:3;color:#8b949e;font-size:13px}
.sum{margin:14px 0 4px}.cur{display:inline-block;width:8px;height:16px;background:#e6edf3;vertical-align:-3px}
</style><div class=win><div class=bar><i></i><i></i><i></i><span>loupe-review</span></div><div class=body>
<div><span class=p>$</span> ${esc(typed)}${typed.length < cmd.length ? '<span class=cur></span>' : ''}</div>
${shown >= 0 ? `<div class=sum><span class=dim>${counts[1]} fail, ${counts[2]} warn</span></div>` : ""}
${fails.slice(0, shown).map((r) => `<div class=row><span class=fail>fail</span><span class=sc>${esc(r.sc)}</span><span>${esc(r.text.length > 118 ? r.text.slice(0, 117) + "…" : r.text)}</span><span class=where>${esc(r.where)}</span></div>`).join("")}
${finale ? `<div class=sum><span class=dim>… and ${warns} warnings (heuristics and advisories)</span></div><div><span class=dim>${exitLine}</span></div>` : ""}
</div></div>`;

const frames = [];
const step = 7;
for (let n = step; n < cmd.length; n += step) frames.push([page(cmd.slice(0, n), -1, false), 0.07]);
frames.push([page(cmd, -1, false), 0.5]);
for (let k = 0; k <= fails.length; k++) frames.push([page(cmd, k, false), k === 0 ? 0.6 : 0.9]);
frames.push([page(cmd, fails.length, true), 3.2]);

const work = join(tmpdir(), `loupe-demo-${process.pid}`);
mkdirSync(work, { recursive: true });
const browser = await chromium.launch();
const pg = await browser.newPage({ viewport: { width: 960, height: 380 } });
const list = [];
for (const [i, [html, secs]] of frames.entries()) {
  await pg.setContent(html);
  const f = join(work, `f${String(i).padStart(3, "0")}.png`);
  await pg.screenshot({ path: f });
  list.push(`file '${f}'`, `duration ${secs}`);
}
list.push(`file '${join(work, `f${String(frames.length - 1).padStart(3, "0")}.png`)}'`);
writeFileSync(join(work, "list.txt"), list.join("\n"));
await pg.screenshot({ path: join(OUT, "loupe-demo.png") });
await browser.close();
const pal = join(work, "pal.png");
const ff = (...a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a]);
ff("-f", "concat", "-safe", "0", "-i", join(work, "list.txt"), "-vf", "fps=12,scale=800:-1:flags=lanczos,palettegen=max_colors=24", pal);
ff("-f", "concat", "-safe", "0", "-i", join(work, "list.txt"), "-i", pal, "-lavfi", "fps=12,scale=800:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=none", join(OUT, "loupe-demo.gif"));
rmSync(work, { recursive: true, force: true });
writeFileSync(join(OUT, "loupe-demo.alt.txt"), `Terminal running loupe-review on a settings page. It reports ${counts[1]} failures: ${fails.map((r) => `${r.sc} ${r.text}`).join("; ")}. Then ${warns} warnings, and exit code ${run.status}.\n`);
console.log(`wrote docs/media/loupe-demo.{gif,png,alt.txt}: ${fails.length} fail rows shown, ${warns} warnings`);
