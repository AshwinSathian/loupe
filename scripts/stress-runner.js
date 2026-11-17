async (page, opts = {}) => {
  // HOW TO RUN (Playwright MCP, one browser_run_code_unsafe call), the same way as measure-runner.js:
  //   async (page) => (<RUNNER>)(page, { skillDir: "<${CLAUDE_SKILL_DIR} as a JSON string>" })
  // Reads <skillDir>/scripts/stress.js and runs each mode with page.evaluate (not blocked by CSP):
  //   reflow at 320 px wide; spacing, text200, pseudo and rtl at each of opts.widths (default [390, 1440]).
  // stress.js reverts its own change before returning, so the page is not reloaded and app state
  // (sign-in, typed input, route) survives. The viewport is restored at the end.
  // Options: skillDir (required), modes (default all five), widths.
  // Result: [{ mode, width, problems: [{ kind, selector?, text?, axis?, examples? }], notes }], one per run.
  if (typeof opts.skillDir !== "string") throw new Error("pass { skillDir: <the skill directory as a JSON string> }");
  const input = await page.evaluateHandle(() => Object.assign(document.createElement("input"), { type: "file" }));
  let src;
  try {
    await input.setInputFiles(`${opts.skillDir.replace(/[\\/]$/, "")}/scripts/stress.js`);
    src = await input.evaluate((i) => i.files[0].text());
  } finally {
    await input.dispose();
  }
  const modes = opts.modes || ["reflow", "spacing", "text200", "pseudo", "rtl"];
  const widths = opts.widths || [390, 1440];
  const vp = page.viewportSize();
  const settle = () => page.evaluate(() => new Promise((done) => {
    const t = setTimeout(done, 200);
    requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); done(); }));
  }));
  const out = [];
  try {
    for (const mode of modes)
      for (const width of mode === "reflow" ? [320] : widths) {
        await page.setViewportSize({ width, height: vp ? vp.height : 900 });
        await settle();
        out.push(await page.evaluate(`(${src})(${JSON.stringify(mode)})`));
      }
  } finally {
    if (vp) await page.setViewportSize(vp);
  }
  return out;
}
