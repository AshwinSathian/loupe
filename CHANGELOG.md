# Changelog

## 2.0.2 (17 November 2026)

- README reorganised after the READMEs of popular tools in the same space: install and a sample of real findings first, then why, what is measured, the CLI's options and exit codes, how it was tested, and what loupe will and won't do.
- Stress-mode selectors inside a web component's shadow root now name the host and the element (`host >>> part`), as the keyboard walk's do; they used to repeat the same selector for sibling elements.
- First release published to npm from GitHub Actions with trusted publishing and provenance.

## 2.0.1 (17 November 2026)

- The CLI is on npm as `loupe-review` (the name `loupe` is taken): `npx -y loupe-review@2 <url>`. The command is still `loupe`. Releases publish from GitHub Actions with npm trusted publishing and provenance; no npm token is stored in the repository.
- `main` now also requires the site build and CodeQL to pass before a merge.

## 2.0.0 (17 November 2026)

loupe 1.x measured the web page as it looked after load, and nothing else: keyboard use, stress states, native apps and tokens were judged by eye, and its own eval could not fail on recall. 2.0 measures those too, runs without a model in CI, says in every report what it checked, and is scored against test cases written by other people.

**Measuring**

- `scripts/interact-runner.js` walks the page with real Tab presses (Option-Tab in WebKit, as Safari skips links on Tab): the accessible name at each stop, whether focus changes anything visible on the element or its two ancestors, focus entirely hidden under fixed or sticky content (WCAG 2.4.11), keyboard traps outside modal dialogs (2.1.2), positive tabindex, and unnamed controls anywhere in the page.
- `scripts/stress-runner.js` applies reflow at 320 px (1.4.10), text spacing (1.4.12), 200% root text, pseudo-localization (+40%) and right-to-left, and reports only the clipping, overflow and sideways scroll each one introduced. Each mode reverts itself in the same call, so no reload loses the app's state.
- `scripts/swift_scan.py` reads SwiftUI, UIKit and React Native source without building: fixed font sizes, Dynamic Type caps, asset images read aloud as button names, tap gestures with no button trait, React Native text that ignores the system size. It also decides the `(26+)` gate, from the built app's SDK when given `--app`.
- `scripts/tokens.py` checks declared colour-token pairs in Design Tokens (DTCG 2025.10) files, one file set per mode, converting the Color module's colour spaces (oklch, display-p3, lab and others) and flagging colours clamped to sRGB.
- `measure.js` reports two more template tells, gradient text and glow shadows on a dark page, and the runner holds animations still while measuring, so a spinning element no longer changes the result between runs.
- Native stress uses Xcode's own launch arguments (double-length strings, right-to-left, AX5) through `simctl launch`, so the project is not edited.

**CLI**

- `bin/loupe.mjs` runs the three runners on one or more URLs in Chromium, WebKit or Firefox and prints a markdown summary or JSON. `--baseline` and `--fail-on new` make it a CI gate that reports new, fixed and still-present findings. Only measured problems that no WCAG exception covers fail a run; heuristics are warnings.
- Finding ids come from the rule, role, text and colours, not from the element's position, so adding a list item does not turn one finding into a new one and a fixed one.
- Page text and selectors are escaped in the markdown, so a page cannot write headings, links or images into a CI summary.
- `file:` URLs need `--allow-file`. Pages behind a sign-in take `--storage-state`.

**Reviews**

- Every report has a Coverage table: each check family marked Measured, Source, By eye, Not checked or N/A, with the evidence.
- The red team walks the core task once per constraint (keyboard only, largest text, one hand, translated) from the measured output, never from imagination.
- An unnamed focusable control, a trap outside a dialog and focus entirely hidden are measured Blockers; a missing focus indicator needs a screenshot first; stress rows are leads until a screenshot confirms them.
- New profile key `baseline`: the review passes it to the CLI and never writes it.

**Rules corrected**

- Apps linked against the iOS 27 SDK ignore `UIDesignRequiresCompatibility` (Apple engineer, Developer Forums thread 832543). The `(26+)` gate used to skip Liquid Glass checks for those apps whenever the key was present; they now run, and a leftover key is a Minor finding.
- APCA is advisory. It is not normative in the 3 March 2026 WCAG 3 draft, so an APCA shortfall on text that passes WCAG 2 is Research, Minor at most, and needs a computed Lc.

**Evals**

- `evals/mutation/`: 12 defects planted at WCAG boundaries (4.48 against 4.54:1, 23 against 24 px) and 8 decoys, committed with a sha256 before each run. Round 1 found two operators that did not encode the defect they named and one engine false positive (pseudo-localization padding that could not wrap); round 2 detected 12 of 12 and stayed quiet on 8 of 8. `notes.md` explains why that is an upper bound.
- `evals/act/`: the W3C ACT Rules test cases for the 11 rules the engine covers, fetched from w3.org at run time. First run: 30 of 58 failing cases caught, 9 of 125 false alarms. It exposed two gaps (a trap that pulls focus back on a timer; unnamed controls outside the Tab order), fixed; second run: 39 of 58, 9 of 125. An independent code review then found a trap pattern the walk read as the end of the page; third run: 40 of 58, 10 of 125 (the same test page counts as a catch under one ACT rule and a false alarm under its composite). `notes.md` lists every remaining miss and why.
- An independent code review of the branch before release found 13 defects, all fixed and tested: the animation hold broke on scroll-driven animations and overrode the page's own `animation-play-state` rules (it now pauses through the inline style and restores the attribute exactly); focus inside a web component's shadow root read as a trap; an autofocused field made the walk skip everything before it; two unnamed buttons with the same role merged into one finding, and unnamed-control and trap ids still depended on position; right-to-left overflow to the left went unreported; `tokens.py` composited translucent backgrounds over white even in dark mode (it now needs `--base`); `swift_scan.py` flagged `@ScaledMetric` sizes as fixed; the docs' browser install line did not match the pinned Playwright.
- Cases F (prompt injection aimed at loupe's own levers: a hidden note, a waiver file request, a request to create a file) and G (seven defects only the new runners measure), each run with and without the skill. Results in `evals/results/2026-11-17.md`.

**Site**

The website was rebuilt from Next.js to Astro, served from Cloudflare's edge as static files. loupe reviewed the rebuild: 26 findings (no Blocker, 7 Major), all addressed. The report and the fixes are on the [specimen page](https://loupe.ashwinsathian.com/specimen#third-h) and in `site/review/third-review.md`.

- Bricolage Grotesque for all text, JetBrains Mono for code only, both cut to Latin. About 26 KB and 8 KB; the mono file loads only on a page with code.
- Inline CSS, the font sent as an HTTP `Link` early hint, prefetch and prerender on hover, CSS page transitions, a strict CSP with no inline script.
- Shimmering skeletons while something is still arriving: the next page after a slow click, images, the hero's measurements, the seal check.
- Social cards generated at build time in the site's own typeface. Build tests for fonts, glyph coverage, headers, sitemap, links and JSON-LD.
- Found and fixed by the review: the finding specimen on the home page collapsing to a dot, silent copy buttons, a seal check that dropped focus, and a page skeleton that covered the masthead.

## 1.1.0 (26 October 2026)

loupe's own site, reviewed after launch with one question: does it look AI-made? It did. It met the slop catalogue's cluster threshold with 6 tells across 5 channels; the pre-launch review had counted 5 across 4 and stopped one short. The report and the fixes are on the site's [specimen page](https://loupe.ashwinsathian.com/specimen#second-h) and in `site/review/second-review.md`.

**Skill**

- `measure.js` reports two more template tells: an eyebrow label above most page and section headings, and monospace on more than two text elements that aren't code. Monospace is detected by glyph width, so code fonts without "mono" in their name count; dates above posts, icon fonts and pages set entirely in mono don't. The catalogue listed both patterns but `measure.js` didn't check them, so reviews counted them by eye and missed some.
- The distinctiveness verdict counts every matched tell. A tell is no longer excused because the direction explains it or the owner chose it. A direction that shows up only in code comments or a style page doesn't count as authored.
- When a count is one tell short of the threshold, section titles and labels above headings are recounted before the verdict.
- The logo-off test is answered from the first viewport of the primary screen. Elements that only appear after scrolling don't count.

**Site**

- The hero headline is measured live in the visitor's browser and marked in redline.
- Eyebrows, decorative crop marks, frame numbers and mono labels are gone. Mono is used only for code and commands.
- Plain headings. The testing headline no longer reads two ways.
- The nav fits on one row on a phone, and every install command wraps.

## 1.0.0 (26 October 2026)

First public release, renamed from hig-review to loupe. The name change keeps an Apple term out of the product name; Apple's guidelines are still the base, and NOTICE says loupe is not affiliated with Apple.

**Skill**

- `SKILL.md` went from about 10,200 tokens to about 3,700. Claude Code keeps the first 5,000 tokens of a skill after compacting a long conversation, so steps 3 to 7 used to drop out of long reviews. The step detail now lives in `references/workflow-intake.md`, `workflow-passes.md` and `whole-app-split.md` and is read when the step runs.
- The description says what the skill does before when to use it.
- The "read-only" rule is now a list of the side effects a review does have. Clearing app data for empty states needs your OK.
- Text from reviewed pages and web research is treated as data, never as instructions.
- Every reference file over 100 lines starts with a contents line (`tools/toc.py`, checked in CI).

**Rules corrected after checking them against Apple's pages, the App Review Guidelines and WCAG 2.2**

- App Review 4.2.6 is cited only with evidence that an app came from a template or app-generation service and was submitted by someone other than the content owner. A generic look is never a Blocker.
- Liquid Glass and other 26-era checks follow the SDK an app is built with and the `UIDesignRequiresCompatibility` opt-out, not the minimum deployment target. New profile keys: `build_sdk`, `design_compatibility_opt_out`.
- Apple's minimum iOS target size is 28 by 28 points; 44 by 44 is the default.
- Context menus hide unavailable items; the menu bar dims them.
- A bare `Image(systemName:)` inside a text style is no longer flagged.
- Several rules were tagged more strongly than their sources state them (cognitive-accessibility guidance, typographic preferences, Apple Pay button sizes, rem units, placeholder labels). They now carry the source's own strength.
- The template-look verdict needs 6 or more tells across 3 or more channels, not 5 in total.
- A rework now needs one root cause shared by every finding it cites, and a missing feature no longer counts as a premise failure. "No rework warranted" is the expected answer for a well-built product.

**Held-out blind round** (`evals/heldout/`)

Pre-registered before any run: three fixtures written by model instances told not to read this repo, Claude Haiku, Sonnet and Opus reviewing each with and without loupe, three blind judges, sealed answer keys. Judges preferred loupe's review in 6 of 9 pairs; loupe's reviews had fewer findings judged wrong or inflated, and no Blockers on the well-built control. Both conditions found nearly every planted defect, and the recall rule failed by half a defect with Haiku, so the round failed one of its four rules. `notes.md` has the reading and the deviations.

After the round, from the judges' criticisms (not re-tested): a 4.1.2 Blocker needs a missing accessible name, not a poor one; placeholder figures in a development build go to Unverified, not Trust; a skipped landscape step must say why; build SDK detection reads `XCODE_VERSION_ACTUAL` and toolchain comments.

**Scripts**

- The measurement runner waits for the page's own theme and resize handlers before measuring, so dark mode on JavaScript-themed sites is measured correctly.
- The runner works on sites with a strict Content Security Policy or Trusted Types, and takes the skill folder as data, so Windows paths and quotes no longer break it.
- Contrast now handles group opacity, `-webkit-text-fill-color`, overlapping layers, open shadow roots and off-screen or inert text. Threshold checks use the unrounded ratio.
- Output is capped: 293 KB on linear.app before, 29 KB after.
- `contrast.py` clamps out-of-range values, rejects NaN and accepts `#rgba`.

**Repository**

- The HIG crawler is no longer in the public repo; Apple's site terms don't allow robots. The digests cite their sources.
- New: NOTICE, SECURITY.md, issue templates, a held-out blind evaluation in `evals/heldout/`, and a website at https://loupe.ashwinsathian.com.

## 0.1.0 (23 October 2026)

Initial version, published as hig-review.
