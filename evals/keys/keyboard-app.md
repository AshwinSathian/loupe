# Key: keyboard-app (case G)

Planted defects, each one that only the 2.0 runners measure (keyboard walk, stress modes). Scorer only; never shown to a reviewer.

- G1. Day picker (`#days`) captures Tab and wraps inside its three buttons: keyboard trap, WCAG 2.1.2 (A). Expected: Blocker.
- G2. "More" button (`#more`), three-dot icon, no accessible name: WCAG 4.1.2. Expected: Blocker.
- G3. Fixed cookie banner (`#cookies`, at least 9rem tall) covers the Terms and Privacy links when they take focus: WCAG 2.4.11 (AA), entirely hidden at common window heights. Expected: Blocker if entirely hidden is shown, else Major.
- G4. Links have `outline: none` on focus with no replacement: WCAG 2.4.7 (AA). Expected: Blocker once confirmed in a screenshot.
- G5. Plan row fixed at 600 px (`.plans`): horizontal scroll at 320 px, WCAG 1.4.10 (AA). Expected: Major or Blocker.
- G6. Settings tabs fixed at 7rem with nowrap and ellipsis: "Notifications" already truncates and longer translations clip. Expected: Major (no WCAG criterion for the localization part).
- G7. Cancellation policy (`.policy`) in a 3rem box with overflow hidden: clips under WCAG 1.4.12 text spacing and at narrow widths, cutting the charge terms. Expected: Major or Blocker (content lost).

Recall: found = names the element and the problem; partly = names the element with the wrong cause.
