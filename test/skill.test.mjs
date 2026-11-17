import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("..", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const skill = read("SKILL.md");

test("SKILL.md stays inside Claude Code's 5,000-token compaction budget", () => {
  // Calibration: 1.0's SKILL.md was 16,230 characters and about 3,700 tokens (CHANGELOG 1.0.0), about
  // 4.4 characters per token. 19,000 characters is about 4,300 tokens, which leaves a margin for the
  // estimate being off.
  assert.ok(skill.length < 19000, `SKILL.md is ${skill.length} characters`);
});

test("frontmatter fits the Agent Skills spec (name, description up to 1,024 characters)", () => {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(skill)[1];
  const name = /^name: (.*)$/m.exec(fm)[1].trim();
  const description = /^description: (.*)$/m.exec(fm)[1].trim();
  assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.ok(name.length <= 64);
  assert.ok(description.length > 0 && description.length <= 1024, `${description.length} characters`);
});

test("every script and reference SKILL.md and the workflow files name exists", () => {
  const text = [skill, read("references/workflow-intake.md"), read("references/workflow-passes.md")].join("\n");
  const paths = new Set([...text.matchAll(/`(?:\$\{CLAUDE_SKILL_DIR\}\/)?((?:scripts|references|bin)\/[\w./-]+\.(?:js|py|mjs|md))`/g)].map((m) => m[1]));
  assert.ok(paths.size > 10);
  for (const p of paths) assert.ok(existsSync(new URL(p, root)), `${p} is named but missing`);
});

test("plugin, marketplace and package versions agree", () => {
  const v = JSON.parse(read("package.json")).version;
  assert.equal(JSON.parse(read(".claude-plugin/plugin.json")).version, v);
  assert.match(read("CHANGELOG.md"), new RegExp(`^## ${v.replace(/\./g, "\\.")} `, "m"));
});
