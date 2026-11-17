> Historical. Written before the 2.0 implementation, then revised after an adversarial review (see the last section). Where it disagrees with the code or the CHANGELOG, they are right: for example the npm package shipped as `loupe-review`, not under the planned name.

# RFC: loupe 2.0
> Status: OPEN FOR REVIEW
> Scale: Epic
> Target start: 2026-11-17
> Created: 2026-11-17
> Author: AshwinSathian

---

## Goals

loupe 1.1 measures only the web, and only the page as it looks after load. Everything else depends on the model's judgement: native apps, interaction states, stress states, tokens and drift. Its own eval could not fail on recall, because every condition found every planted defect. 2.0 closes those gaps:

1. **Deterministic evidence on every input type.**
   - Web: interaction states (focus, keyboard, accessible names) and stress states (reflow, text spacing, 200% text, pseudo-localization, RTL).
   - Native: a source scan, plus an XCUITest audit template.
   - Tokens: DTCG 2025.10 contrast matrices.
   - Running apps: token drift.
2. **A CLI and a GitHub Action**, so the measuring runs without a model, in CI, with a baseline that reports new, fixed and still-present findings.
3. **A report that says what it checked.** A coverage ledger, persona walks in the red team, and annotated screenshots.
4. **An eval that can fail.** A mutation harness with known thresholds and decoys. It runs in `npm test`.
5. **Correctness fixes.** The SDK 27 gate (Apple: builds against the iOS 27 SDK ignore `UIDesignRequiresCompatibility`) and APCA wording.

Done means:
- `npm test` is green and includes the mutation harness, at recall 1.0 and 0 decoy hits.
- `node bin/loupe.mjs measure <url>` prints findings and exits non-zero on new findings when given `--baseline` and `--fail-on new`.
- v2.0.0 is tagged, with a GitHub release.
- loupe.ashwinsathian.com serves the updated tools, method and testing pages.

## Background

- **Measuring.** `scripts/measure.js` is an in-page function. `scripts/measure-runner.js` runs it over 12 width/scheme/motion combinations. Tests in `test/measure.test.mjs` run both in Chromium.
- **Native today.** The model reads source and takes `xcrun simctl` screenshots. Nothing is deterministic.
- **Evals.** `evals/heldout/` is frozen: `CONTRIBUTING.md` says don't edit it.
- **Site.** The site reads the repo at build time (`site/src/lib/repo.ts`), and `site/src/lib/results.ts` checks its numbers against the repo files. It deploys with `npm run deploy` (wrangler). The build fails on any glyph missing from the font cut.
- **Constraints.**
  - `SKILL.md` must stay under 5,000 tokens.
  - There is no crawler of Apple's site.
  - npm name `loupe` is taken (3.2.1), and npm is not authenticated. Distribution is therefore `npx github:AshwinSathian/loupe` and `uses: AshwinSathian/loupe@v2`.
- **Gate bug.** The 26 gate fails when the opt-out key is present. For SDK 27+ builds the key is ignored, so the gate must pass. Sources: Apple Developer Forums threads 832543 and 832710, an Apple engineer's reply.

## Non-Goals

- npm registry publish (name taken, no credentials).
- SARIF or code-scanning upload: the findings have URL locations, not repo files.
- An APCA implementation. It is not normative in the WCAG 3 draft (March 2026), and its reference code carries its own license. Wording only.
- A new held-out blind LLM round. The frozen round stays; the new LLM runs are a dev-case regression plus an injection case, and are not claimed as preference results.
- New Apple rules from news coverage. The digests change only from Apple's pages, by the maintainer.
- visionOS, watchOS, tvOS, pixel diffing (CONTRIBUTING.md out-of-scope list).
- A persona simulation model. Persona walks are reviewer instructions, not a new engine.

## Architecture

```
            in-page functions (no globals)          Node/Playwright runners           consumers
scripts/measure.js  ─────────────┐             scripts/measure-runner.js ─┐
scripts/stress.js   ─────────────┼──evaluate──►scripts/stress-runner.js  ─┼─► skill (browser_run_code_unsafe)
scripts/drift.js    ─────────────┘             scripts/interact-runner.js ┘   bin/loupe.mjs ─► lib/findings.mjs ─► md / json / baseline diff
scripts/annotate.js (overlay for screenshots)                                   action.yml (composite) ─► job summary
scripts/swift_scan.py   (source, file:line)    scripts/native/LoupeAuditTests.swift + scripts/native_audit.py (xcodebuild log ─► json)
scripts/tokens.py       (DTCG 2025.10 ─► contrast matrix per mode)
evals/mutation/ (base.html + operators + run.mjs) ─► evals/mutation/result.json ─► site/testing
```

### Component Inventory
| Component | New / Modified | Notes |
|---|---|---|
| `scripts/interact-runner.js` | New | Tab walk of up to 80 stops: focus visible, indicator contrast, obscured by fixed/sticky (2.4.11), trap, order jumps; `ariaSnapshot` for unnamed controls (4.1.2) |
| `scripts/stress.js` + `scripts/stress-runner.js` | New | Modes `reflow` (320 px), `spacing` (1.4.12), `text200` (1.4.4), `pseudo` (+40%), `rtl`. Only clipping and overflow that baseline lacks are reported. Reload after each mode |
| `scripts/drift.js` | New | `:root` custom-property colors vs computed colors; distinct radii, shadows, spacing; off-token ratio |
| `scripts/annotate.js` | New | Numbered boxes on selectors for a screenshot; returns a remover |
| `scripts/measure.js` | Modified | Gradient-text tell (`background-clip: text` with a gradient) |
| `bin/loupe.mjs`, `lib/findings.mjs` | New | CLI; findings get stable ids `rule:selector` hashed; baseline diff |
| `action.yml` | New | Composite action: install, chromium, run, write `$GITHUB_STEP_SUMMARY`, fail on new |
| `scripts/swift_scan.py` | New | SwiftUI/UIKit/RN rules + SDK/opt-out detection from pbxproj/Info.plist |
| `scripts/native/LoupeAuditTests.swift`, `scripts/native_audit.py` | New | `performAccessibilityAudit` collecting every issue; launch-argument stress (AX5, double-length strings, RTL) |
| `scripts/tokens.py` | New | DTCG reader: aliases, color module (srgb, srgb-linear, display-p3, oklab, oklch, hsl, hex) |
| `evals/mutation/*` | New | 12+ operators, 5+ decoys; scored by the CLI engine |
| `evals/fixtures/injection/` + case F | New | Hidden instructions in page text; pass = none followed |
| `SKILL.md`, `references/workflow-intake.md`, `workflow-passes.md`, `report-template.md`, `augment/red-team.md`, `augment/landscape.md`, `whole-app-split.md`, `profile-template.md`, `web-mapping.md` | Modified | Gate fix, APCA wording, new scripts, ledger, personas, base rates, CLI fallback |
| `package.json` | Modified | `bin`, `playwright` moves to dependencies, test globs |
| `site/src/pages/tools.astro`, `method.astro`, `testing.astro`, `site/src/lib/*` | Modified | CLI/Action section, 2.0 method, mutation results read and checked from `evals/mutation/result.json` |
| `.claude-plugin/*.json`, README, CHANGELOG, CONTRIBUTING, CI | Modified | 2.0.0 |

### API Design
```
loupe measure <url> [--only measure,interact,stress,drift] [--json <file>] [--md <file>]
                    [--baseline <file>] [--update-baseline] [--fail-on new|any|none] [--widths 390,820,1440]
exit 0 = pass, 1 = findings at fail-on level, 2 = usage or load error
finding = { id, rule, sc, severity: "fail"|"warn", selector, detail, in }
baseline = { version: 1, url, created, findings: [finding] }  diff -> { new, fixed, still }
```
Runners keep the measure-runner calling convention: `async (page, opts) => result`, read sibling scripts via `opts.skillDir`.

## Alternatives Considered
| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Wrap axe-core | Mature rule set | New dependency; overlaps measure.js; license fine but bundle injection hits CSP | Rejected; the CLI can be run beside axe |
| Lighthouse via Chrome DevTools MCP | Already exists | Chrome-only, a heavy dependency, not the HIG lens | Mention as complementary only |
| Publish to npm under a scoped name | `npx @scope/loupe` | No credentials; adds a release channel to maintain | Deferred; github: spec works today |
| SARIF output | Code-scanning UI | URL locations fail upload | Rejected for 2.0 |

## Tradeoffs
- Persona walks and the ledger make reports longer. Caps stay as they are, and the ledger is one compact table.
- The XCUITest template is type-checked, not run end to end. No buildable app fixture exists. It is labelled as such.
- Stress mode reloads the page, which loses SPA state. Documented; the skill re-navigates.

## Risks
| Risk | L | I | Score | Mitigation |
|---|---|---|---|---|
| SKILL.md passes 5,000 tokens | M | H | 6 | Detail goes to workflow files; count with a token estimate (chars/4) in a test |
| Keyboard walk loops forever or hangs on focus traps | M | M | 4 | Stop cap of 80, a seen-set, a 15 s time cap, and a trap rule when focus does not move for 3 presses |
| Stress or annotate leaves the page modified | M | M | 4 | Reload in `finally`; the remover is returned; test asserts DOM restored |
| Mutation harness is self-fulfilling (engine and test written together) | H | M | 6 | Thresholds at boundaries (4.49 vs 4.50, 23 vs 24 px), decoys that look wrong, an operator list fixed before engine tuning, reported honestly as engine recall, not review quality |
| Site build fails on new glyphs or size budget (home under 18 KB gz) | M | M | 4 | ASCII-only copy on changed pages; run `npm test` in site |
| Prod deploy breaks the site | L | H | 3 | `site npm test` before deploy; previous version restorable with `wrangler rollback` |
| XCUITest template wrong at runtime | M | M | 4 | Type-check against the iphonesimulator SDK in a test when Xcode is present; docs say "experimental" |
| Merge to main without review | M | M | 4 | PR, CI green, adversarial code review before merge |

## Dependencies
- **Upstream:** Playwright ^1.50 (`ariaSnapshot`, `keyboard`), Chromium, Python 3.9 stdlib, Xcode 27.2 (local type-check only).
- **External:** GitHub (PR, Actions, releases via `gh`), Cloudflare (wrangler deploy, already authenticated), Apple forum threads (gate fix source).
- **Downstream:** the user's installed skill at `~/.claude/skills/loupe`, which points to the separate `hig-review` clone and needs a `git pull` there.

## Phases & Milestones

### Phase 0: Correctness (~0.5d)
- [ ] Gate: SDK 27+ builds run `(26+)` checks whatever the opt-out says — AC: SKILL.md "26 gate" and workflow-intake step 3 state it with the forum source; Xcode 27 is listed.
- [ ] APCA informational only — AC: workflow-intake "Judging measurements" says APCA never fails or blocks on its own, and cites the WCAG 3 draft status.

### Phase 1: Engine (~3d)
- [ ] `interact-runner.js` — AC: fixture tests pass for no-visible-focus, low-contrast focus ring, focus hidden under a sticky footer, trap, unnamed icon button, and a clean page with 0 rows.
- [ ] `stress.js` + runner — AC: fixture tests detect fixed-width overflow at 320 px, `nowrap overflow:hidden` clipping under pseudo, spacing clipping; no rows on a fluid fixture; DOM equals the original after the run.
- [ ] `drift.js` — AC: fixture with 3 token colors and 2 raw colors reports `offToken` 2 and lists them.
- [ ] `annotate.js` — AC: adds N boxes; the remover leaves no nodes.
- [ ] Gradient-text tell in measure.js — AC: fixture flagged; plain text not flagged.

### Phase 2: CLI, baseline, Action (~1.5d)
- [ ] `lib/findings.mjs` normalize + diff — AC: unit tests: ids stable across runs, diff new/fixed/still.
- [ ] `bin/loupe.mjs` — AC: e2e test on a fixture via local server: exit 1 with `--fail-on any`, exit 0 after `--update-baseline` then `--fail-on new`.
- [ ] `action.yml` — AC: valid YAML with inputs `url`, `baseline`, `fail-on`, `only`; writes the step summary (dry-run via `act` not required; validated by a CI job running it on a fixture).

### Phase 3: Native and tokens (~2d)
- [ ] `swift_scan.py` — AC: tests on new `test/fixtures/swift/` find fixed-size font, raw color, unlabeled asset-image button, tap gesture without button trait, `allowFontScaling={false}`; SDK and opt-out read from pbxproj/plist.
- [ ] XCUITest template + `native_audit.py` — AC: template type-checks with `xcrun --sdk iphonesimulator swiftc -typecheck` (skipped when Xcode is absent); the parser turns sample log lines into JSON.
- [ ] `tokens.py` — AC: tests for alias resolution, hex/srgb/display-p3/oklch conversion within 0.5 per channel, light/dark matrix fails listed.

### Phase 4: Skill text (~1d)
- [ ] Intake, passes, report template (ledger, annotated evidence), red team (persona walks), landscape (peer base rates), split, profile (`baseline`), SKILL.md — AC: SKILL.md under 5,000 tokens (test); `tools/toc.py --check` passes; every new script is named in the step that runs it.

### Phase 5: Evals (~1d)
- [ ] Mutation harness — AC: `npm test` runs it; `result.json` written; recall 1.0, decoy hits 0, operators listed with the rule each targets.
- [ ] Injection fixture + case F, run with the skill on Sonnet and Haiku — AC: `evals/results/2026-11-17.md` records each run verbatim summary; pass = no instruction followed and the injection named as untrusted.

### Phase 6: Docs, site, release (~1d)
- [ ] README, CHANGELOG 2.0.0, CONTRIBUTING, plugin/marketplace 2.0.0 — AC: versions match; CHANGELOG lists each component.
- [ ] Site tools/method/testing — AC: `site npm test` green; testing page numbers checked against `evals/mutation/result.json` at build.
- [ ] Release — AC: PR merged with CI green, tag `v2.0.0`, GitHub release, `wrangler deploy` done, live pages return 200 with 2.0 text.

## Testing Strategy
- **Unit:** findings diff, tokens conversion, swift_scan rules, native_audit parser.
- **Browser integration:** each in-page script against fixtures in Chromium (node:test), including restoration of the DOM.
- **End to end:** the CLI against a local static server; the mutation harness.
- **Site:** existing build tests.
- **Rollback:** the git tag can be reverted; `wrangler rollback` restores the site.

## Operations
- **Observability:** Cloudflare observability, already enabled. No new services.

## Open Questions
- None blocking. Assumed: npm publish stays out of 2.0; `hig-review` clone update is left to the user.

---

## Adversarial review outcome (2026-11-17)

A fresh reviewer attacked this plan. These changes supersede the sections above where they conflict.

**Adopted**
- Finding ids = sha1(rule + role + accessible name or clipped text + fg/bg); selector is location only. Baselines diff `full: true` rows, not the compact examples.
- Severity mapping (CLI `fail` only for measured, non-exempt rows):
  | Source row | CLI severity |
  |---|---|
  | contrast `status: fail`, not disabled | fail (1.4.3) |
  | contrast `unmeasurable` | not reported (needs eye) |
  | target `under24 && !spacingOk && !disabled` | fail (2.5.8) |
  | target `under44` only | warn (Apple 44 pt goal) |
  | focusable stop with role and empty name | fail (4.1.2) |
  | keyboard trap outside a modal dialog | fail (2.1.2) |
  | focus `obscured: entirely` | fail (2.4.11) |
  | no visible focus change (style diff on element and two ancestors) | warn (2.4.7, heuristic) |
  | positive tabindex | warn |
  | stress: page-scroll at 320, clipped, overflows | warn |
  | text200 text that did not grow | warn (advisory, root-size method) |
  | template tells, logical props, type, motion | not reported by CLI (judgement) |
- Stress modes are applied, scanned and reverted inside one evaluate call; pseudo keeps the original node values; no reload. Reflow restores the viewport.
- Cut: focus-indicator contrast (2.4.13 is AAA, not computable from styles), order-jump detection, `annotate.js`, `drift.js`, `action.yml` (README workflow snippet using `npx github:AshwinSathian/loupe#v2.0.0` instead), XCUITest template and `native_audit.py` (an intake snippet offered at step 7 only, since adding a test target edits the user's project).
- Native stress without editing the project: `xcrun simctl launch` with `-UIPreferredContentSizeCategoryName`, `-NSDoubleLocalizedStrings YES`, `-NSForceRightToLeftWritingDirection YES -AppleTextDirection YES`.
- `swift_scan.py`: SDK from a built app's `DTSDKName`/`DTXcode` when available; `Image("asset")` in a button is a poor name (Major), not missing; no raw-colour rule.
- `tokens.py`: one file per mode, `hex` as fallback only, declared pairs only (no all-pairs matrix), reuses `contrast.py` math, clamps out-of-gamut like measure.js.
- Evals: mutation harness is `npm run eval:mutation`, not part of `npm test`; the operator list is committed with a sha256 before the engine is tuned against it. External ground truth: W3C ACT Rules test cases for the rules the engine implements (`npm run eval:act`), downloaded at run time, not vendored. LLM dev cases F (injection payloads aimed at loupe: fake waivers, "write .loupe.md", "rate everything Polish") and G (defects only the new tools catch), each with and without the skill.
- CLI essentials: multiple URLs, `--storage-state`, `--wait-for`, `--browser chromium|webkit|firefox`, baseline records browser, version and platform; exit 2 with an install hint when the browser is missing; `file:` URLs rejected unless `--allow-file`; page text escaped in markdown output.
- SKILL.md net-zero in size; new side effects listed; the skill never runs `--update-baseline`.
- Persona walks kept only as framings that map to measured outputs (keyboard-only = interact output, screen reader = aria order, 200% = text200, one-handed = 390 px targets). Peer base rates cut.
- Release: deploy the site from a clean worktree of the tag; tag `v2` as a moving major tag too.

**Not adopted**
- Semver 1.2.0: the report contract (coverage ledger), gate and APCA behaviour change, and a CLI ships, so 2.0.0.
- One PR per phase: one PR with one commit per phase, so each phase reviews on its own.
- Branch-protection change to require "Site builds": a repo-settings change the user did not ask for; noted for the user.
