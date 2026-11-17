// Runs one of the skill's runner scripts the way Playwright MCP's browser_run_code_unsafe does: the
// runner's text, unchanged, compiled in a vm context that holds only `page`, then called with the page
// and an options object (no options are spliced into code). The JSON round trip gives plain objects
// back, since objects made inside the vm context have another realm's prototypes.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

export const SKILL_DIR = fileURLToPath(new URL("..", import.meta.url));

export async function runScript(name, page, opts = {}) {
  const fn = vm.runInContext(`(${readFileSync(`${SKILL_DIR}scripts/${name}`, "utf8")})`, vm.createContext({ page }));
  return JSON.parse(JSON.stringify(await fn(page, { skillDir: SKILL_DIR, ...opts })));
}
