# Contributing to loupe

Most useful contributions start as an issue. The two that matter most:

- **A wrong or inflated finding.** A review flagged something that is fine, or called a Minor a Blocker. Use the [wrong finding form](https://github.com/AshwinSathian/loupe/issues/new?template=wrong-finding.yml) and paste the row from the report.
- **An outdated rule.** A file in `references/` says something Apple's guidance, or another cited source, no longer says. Use the [outdated rule form](https://github.com/AshwinSathian/loupe/issues/new?template=outdated-rule.yml) with a link to the current page.

Questions about using loupe go to [Discussions](https://github.com/AshwinSathian/loupe/discussions). Security problems go through [private vulnerability reporting](https://github.com/AshwinSathian/loupe/security/advisories/new), as described in [SECURITY.md](SECURITY.md).

## What loupe won't take

Some limits are deliberate, and a pull request that crosses them will be closed:

- Pushing an Apple look, or any trending look, onto a product with its own brand. loupe applies Apple's principles and keeps the product's identity.
- visionOS, watchOS and tvOS, visual regression testing and pixel diffing. They are out of scope for now; open a discussion if you want to make the case.
- A crawler or scraper for Apple's site. Apple's site terms forbid robots, so the digests are refreshed by hand.
- Long passages copied from Apple or other sources. The references paraphrase and quote briefly with attribution; see [NOTICE](NOTICE).

## Setting up

You need Node 20 or later and Python 3.9 or later.

```bash
git clone https://github.com/AshwinSathian/loupe.git
cd loupe
npm install
npx playwright install chromium
npm test
```

`npm test` runs the measurement scripts against the fixtures in `test/fixtures/` in Chromium, then the contrast scripts and the maintenance tools. CI runs the same on every pull request, plus a build of the site in `site/`.

To try your copy of the skill in Claude Code, run `claude --plugin-dir /path/to/loupe`.

## Changing a reference file

The files in `references/` are what the model reads during a review, so small wording changes can move its ratings.

1. Keep Apple's strength words. MUST, SHOULD and CONSIDER are copied from Apple's own wording; don't upgrade a "consider" to a "should".
2. Cite the page you took the rule from.
3. If you edited a file that was built from a digest in `research/digests/`, check that no number was dropped:
   ```bash
   python3 -I tools/check_numbers.py research/digests/<digest>.md references/<file>.md --allow tools/allow/<file>.txt
   ```
4. Refresh the contents line at the top of the file with `python3 -I tools/toc.py`. CI fails if it is stale.

`SKILL.md` stays under 5,000 tokens. Detail that only one step needs belongs in that step's `references/workflow-*.md` file.

## Changing how reviews behave

If your change could alter what a review reports (a rule, a threshold, the workflow, a measurement), say in the pull request which cases in [evals/cases.md](evals/cases.md) you ran, with and without the change, and what moved.

Don't edit anything in `evals/heldout/`. It is the record of a pre-registered blind round, and `keys.sha256` pins the answer keys.

## Pull requests

- Branch from `main`. `main` only takes changes through pull requests, and the Test check has to pass.
- Commit messages follow the `type: summary` form already in the history (`fix:`, `feat:`, `docs:`, `chore:`), with a body that says why.
- Add a line under a new heading at the top of [CHANGELOG.md](CHANGELOG.md) for anything a user of the skill would notice.
- Write the way the references are written: the specific fact, the number, the file. [references/writing.md](references/writing.md) has the rules loupe applies to interface copy, and most of them apply here too.

By contributing you agree that your work is released under the [MIT license](LICENSE), and that you will follow the [Code of Conduct](CODE_OF_CONDUCT.md).
