# ACT Rules eval: notes

The W3C ACT Rules Community Group publishes test cases for its accessibility rules, each marked passed, failed or inapplicable. They were written by other people for other tools, so they are the outside check on loupe's engine that the mutation eval (`evals/mutation/`) cannot be. `run.mjs` fetches the index from w3.org at run time (nothing is vendored), loads every approved test case for the 11 rules that map onto an engine rule, and scores it. A loupe review reads these rows as leads and rates them under SKILL.md; the scores here are for the engine alone.

## First run (2026-11-17)

`result-first-run.json`: caught 30 of 58 failed cases; false alarms on 9 of 125 passed or inapplicable cases.

Two engine gaps, fixed before the second run:

- A keyboard trap made with `onblur="setTimeout(() => this.focus(), 10)"` was missed: the walk read focus straight after the key press, before the timer pulled it back. The walk now waits 60 ms after each press.
- Unnamed controls outside the Tab order (a disabled input, a `div role=textbox` inside a label) were counted from the aria snapshot but never reported. They are now a warning (`name-unreached`), without a selector, because the snapshot has none.

## Second run

`result.json`: caught 39 of 58; false alarms 9 of 125.

What it still misses, and why (not fixed, by choice):

- **Contrast over gradients and images (5 cases).** The engine reports these as unmeasurable instead of guessing. A review samples pixels with `scripts/png_contrast.py`; the engine alone does not.
- **Image buttons (3) and empty summary elements (3).** Chromium gives `<input type=image>` with no alt the name "Submit", and the aria snapshot does not list an empty `<summary>` as a control, so the engine sees a name or no control where ACT sees an empty name.
- **Zoomed text clipped by overflow (5).** The `text200` mode scales the root font size, which px-set text ignores; ACT's cases need browser zoom. Not emulated.
- **One form field and one link** whose names come from sources the snapshot resolves differently from ACT's expectation.

False alarms: 3 keyboard traps that ACT passes because the page tells the user how to leave (the engine cannot read instructions); 4 contrast rows on text ACT does not test: 2 labels of disabled controls (the engine exempts only text inside the disabled element, not its label) and 2 runs of glyphs ACT treats as non-language (a string of symbols, an "X" on a button named "Close"); and 2 focus-visible rows where focus is shown by a separate indicator element elsewhere on the page, which a style diff of the element and its two ancestors cannot see. These are why the CLI marks trap and contrast as fail but a review confirms them first, and why focus-visible is only a warning.
