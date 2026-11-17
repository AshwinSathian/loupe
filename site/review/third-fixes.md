| # | Finding | Status | What changed |
|---|---|---|---|
| 1 | Copy announces nothing | Fixed | The status line says "Copied." and clears with the label. |
| 2 | Baseline report widens /cases/lendwell at 320 px | Fixed | Code blocks in reports scroll inside themselves. Long words and links wrap. Every route measures 320 px wide at 320 px with text at 200%. |
| 3 | Seal check drops focus to the page | Fixed | The button stays focusable (`aria-disabled` while it runs), so focus stays where it was. |
| 4 | Page skeleton covers the masthead and sits 58 px off | Fixed | The skeleton starts under the masthead, measured at click time, so the wordmark and nav stay put and the page no longer jumps. |
| 5 | Seal skeleton renders as an empty box | Fixed | Dropped for one module: a line of status text while it fetches. |
| 6 | The loupe specimen shrinks to a 2 px dot | Fixed | The script set the stage's height from its width while CSS derived the width from that height, losing the border each frame. CSS alone now sizes the stage and the script only reads it. Measured stable at 388 × 638 after 3.5 s; the check is in the browser test used for this review. |
| 7 | Checker sample contradicts its ratio in dark mode | Fixed | The sample is painted on the same white base the ratio is computed over. |
| 8 | Seal result read cell by cell; first fetch not checked | Fixed | One summary sentence in the live region, the table outside it, both fetches checked, and an error message that says nothing was checked and links to the files. |
| 9 | Invalid colour half announced | Fixed | Announced after the same pause as a result, and the field gets a 2 px redline border. |
| 10 | Colour pickers 37.8 px wide | Fixed | They no longer shrink: 44 px. |
| 11 | Owner's choice: Bricolage I and l look the same | Fixed another way | Code and commands are now set in JetBrains Mono, the one exception to Bricolage, so a command is never mistaken for prose and I, l, 1, O and 0 differ where they matter. The mono file is 8 KB and loads only on a page with code. Prose keeps Bricolage by choice. |
| 12 | Optical size pinned at 36 | Partly | Pinned at 24 instead, which suits body text better. Keeping the axis costs 51 KB against 26 KB, past the point where the file needs a third round trip, so it stays pinned. |
| 13 | Finding panels not reachable by Tab | Fixed | Each panel is a tab stop. |
| 14 | Reduced motion removed the shape but kept the moving bar | Fixed | Under reduced motion the skeleton stays, still, and the progress bar is a static half-bar. |
| 15 | Placeholders 1.3:1 against the page | Fixed | A `--ph` token at 1.58:1 in light and 1.82:1 in dark. Both pairs are in the build's contrast check and on this page. |
| 16 | Owner's choice: inline code only a tint | Fixed | Code is in its own face now, so the tint is gone. |
| 17 | Five links glued to the word before them | Fixed | Spaces restored, and a build test fails on a link touching a letter. |
| 18 | Footer and /cases claimed a review that was not yet shown | Fixed | This block is the evidence. |
| 19 | Copy about type out of step with the source | Fixed | The specimen's type section describes both faces. |
| 20 | Dead controls with JavaScript off | Fixed | All five findings show as a list without script; tabs, copy buttons, the bookmarklet copy and the seal button appear only once script runs. |
| 21 | Readout shimmers for ever if the script fails | Fixed | A CSS-only exit hides the placeholders after 5 s. |
| 22 | Install commands were four needless tab stops | Fixed | The region role, tab stop and label are gone; the Copy button's name says what it copies. |
| 23 | 2 px sideways scroll at 390 px with 200% text | Fixed | See 2: grid tracks and headers can shrink. Measured 0 at 390 and 320 on every route. |
| 24 | "3.97: 1" | Fixed | "3.97:1". |
| 25 | Failed copy label stuck; ⌘ glyph outside the font | Fixed | The label resets after 4 s and the hint says Cmd+C. |
| 26 | Readout measured twice, with the fallback face first | Fixed | It measures once the real face has loaded. |
