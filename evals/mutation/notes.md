# Mutation eval: notes

What this measures: whether loupe's measurement engine (the measure, interact and stress runners, scored through `lib/findings.mjs`) reports a defect planted at a known threshold, and stays quiet on decoys that look wrong but pass. It does not measure the quality of a review. The engine and the operators were written by the same author in the same week, so these numbers are an upper bound on what the engine does on real pages; the W3C ACT test cases (`evals/act/`) are the outside check.

## Round 1 (2026-11-17)

Operators committed in `7a6fb5b`-era history with `operators.sha256` before the first run. Result: `result-round1.json`. Base page not clean; defects detected 10 of 12; decoys clean 7 of 8.

Every miss, read before changing anything:

- **target-23 (operator error).** Two 23 px buttons 2 px apart pass WCAG 2.5.8: their centres are 25 px apart, so 24 px circles centred on them do not intersect each other or the other target. The engine was right. Round 2 puts them edge to edge (centres 23 px apart).
- **decoy-contrast-4.54 (operator error).** `#767676` passes on white but the operator applied it in dark mode too, where it fails on the dark background. The engine was right. Round 2 scopes the colour to light mode.
- **fixed-height (miss as specified).** The box was already clipped at 390 px before text spacing was applied, so `spacing`, which reports only problems a mode introduces, did not report it; `reflow` reported it as `reflow-clipped`. Round 2 makes the box fit until spacing is applied.
- **Base page (engine bug and fixture gap).** Pseudo-localization padded text with one unbreakable run of tildes, which overflowed a narrow card that real translated text would wrap in: an engine false positive, fixed in `scripts/stress.js` (padding now wraps every 5 characters). The base page's standalone "Data sources" link was 18 px tall, a real warning against Apple's 44 pt goal: fixed in the base page.

## Round 2

Operators and base re-committed with a new `operators.sha256` before the run. Result: `result.json`.
