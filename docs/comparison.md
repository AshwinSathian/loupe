# How loupe compares

Checked 17 November 2026. What this page says about other tools comes from their own READMEs and documentation, linked at the end, and the star counts are from that day. If something here is out of date, [open an issue](https://github.com/AshwinSathian/loupe/issues/new/choose).

loupe is two things: a design-review skill for coding agents (built and tested in Claude Code; installs for Codex and Gemini CLI were checked by running those tools, Cursor's against its documentation), and `loupe-review`, a CLI that runs the skill's browser measurements without a model. It doesn't replace the tools below. Most of them do the job they were built for better than loupe would.

## Pick something else when

- **You need a broad WCAG gate across many pages.** Use [axe-core](https://github.com/dequelabs/axe-core) (through `@axe-core/playwright`) or [Pa11y](https://github.com/pa11y/pa11y). axe-core's rule list has about a hundred rules, around 75 of them tagged to WCAG criteria, and years of production use; its README says it "returns zero false positives (bugs notwithstanding)". loupe's engine covers 11 ACT rules. On the W3C's own ACT test cases for those rules it caught 40 of 58 failing cases and raised 10 false alarms in 125 passing ones.
- **You want one score for accessibility, performance and SEO in the same run.** Use [Lighthouse](https://github.com/GoogleChrome/lighthouse). Its accessibility score is weighted from axe-core's audits.
- **You want your agent steered while it builds.** Use [Impeccable](https://github.com/pbakaus/impeccable): 24 commands such as `polish`, `bolder` and `critique`, a live browser mode, a Chrome extension, support for 19 agents, and 62 deterministic rules that need no model. Its README says rules for low contrast and tiny text run on a rendered page when you scan a URL.
- **You're building a new page and want guidance.** Use Anthropic's [frontend-design skill](https://github.com/anthropics/skills/tree/main/skills/frontend-design). It builds; it measures nothing.
- **You want a quick source-level lint with `file:line` output.** Use Vercel's [web-design-guidelines skill](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines), which checks code against a fixed web checklist. It fetches its rules from the network on each run and doesn't open a browser.

## Pick loupe when

- **Keyboard use matters.** loupe presses Tab through the page and reports focusable controls with no accessible name, keyboard traps outside dialogs, and focus hidden under a fixed bar. I found no equivalent in the other tools' documentation: Impeccable's README doesn't mention a keyboard walk, and axe-core's rule list has no keyboard-trap rule. That is absence from documentation, not proof that they can't.
- **Layout under stress matters.** It applies a 320 px window, WCAG text spacing, 200% text, text 40% longer and right-to-left, keeps only what each one broke, and undoes each one.
- **You ship for Apple platforms.** Each rule it cites shows how strongly Apple states it (MUST, SHOULD or CONSIDER, copied from Apple's wording), and a source scan covers SwiftUI, UIKit and React Native. Impeccable also covers native iOS, from the HIG; its README doesn't say it tags rule strength.
- **You want a review, not a list.** Findings carry an Impact (Blocker, Major, Minor, Polish) that needs evidence, a table says which checks were measured and which were judged, and "no rework warranted" is a normal answer.
- **You want CI baselines.** `loupe-review --baseline` reports new, fixed and still-present findings with ids that don't change when an element moves.

## Side by side

| Tool | What it is | Where it checks | Needs a model | Real Tab walk | Judges design | Platforms | Licence | Stars |
|---|---|---|---|---|---|---|---|---|
| loupe | Skill and CLI | A real browser; native source scan | Skill: yes. CLI: no | Yes | Yes (skill) | Web, iOS, iPadOS, macOS | MIT | 0 |
| Impeccable | Skill, CLI, Chrome extension | Source files; a rendered page for some rules | Not for its 62 rules | Not in its docs | Yes (`critique`, `audit`) | Web; native from HIG and Material references | Apache-2.0 | 112k |
| frontend-design | Skill | Nothing | Yes | No | Build guidance | Web | Apache-2.0 | 197k (whole repo) |
| web-design-guidelines | Skill | Reads your source | Yes | No | Checklist | Web | Not stated on the repo | 34k (whole repo) |
| axe-core | Library | A real DOM, in your test | No | Not in its docs | No | Web | MPL-2.0 | 7.8k |
| Lighthouse | CLI | Chrome | No | Not in its docs | No | Web | Apache-2.0 | 31k |
| Pa11y | CLI | Headless Chrome | No | Not in its docs | No | Web | LGPL-3.0 | 4.6k |

## What loupe doesn't do

- It gives no score, and checks no performance or SEO.
- Its engine has far fewer rules than axe-core. It is not a WCAG audit, and automated checks find part of what a manual audit finds: in Deque's own (vendor-measured) study, automated tests found 57% of issues by count.
- Skill reviews are written by a model, so they vary from run to run. Only the CLI is deterministic.
- In loupe's blind test, judges preferred its reviews in 6 of 9 pairs, but it did not find more defects than the same models without it, and only Claude models were tested.
- Through an agent, measuring a web app needs a Playwright MCP server, or the CLI in a shell. Without either, measured checks are listed as unverified.
- Native apps get a source scan and simulator screenshots, not live measurement.
- It is new. It had no stars when this was written, against thousands for every tool above.

## Using them together

- axe-core in your unit and end-to-end tests for broad WCAG coverage, `loupe-review` in CI for the keyboard walk and stress modes, and Lighthouse for a performance budget.
- Impeccable while you build, loupe before you ship. Both flag AI-template patterns, so expect some duplicate findings.

## Sources

All checked 17 November 2026.

- [loupe's evals](https://loupe.ashwinsathian.com/testing) for every loupe number on this page.
- [Impeccable README](https://github.com/pbakaus/impeccable#readme): commands, the 62 rules, rendered-page rules, 19 agents, native support.
- [anthropics/skills, frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design).
- [axe-core README](https://github.com/dequelabs/axe-core#readme) and its [rule descriptions](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md); [Deque's coverage report](https://www.deque.com/automated-accessibility-coverage-report/) (vendor-measured).
- [Lighthouse accessibility scoring](https://developer.chrome.com/docs/lighthouse/accessibility/scoring) and [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci).
- [Pa11y](https://github.com/pa11y/pa11y).
- [Vercel web-design-guidelines](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines).
