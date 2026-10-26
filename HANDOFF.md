# HANDOFF — 2.0, `legacy` on remark-parse 8

The 1.x handoff priced porting `legacy` to remark-parse 8 (rp8) as a product decision resting on
three premises: upstream's reader reached only 99.2%, porting would re-open the 1,689 documents
micromark won, and it would abandon `strict`. All three were wrong. Upstream's referee suite
asserts agreement with every answer file vendored here except the four P1/P2 documents; the 1,689
were Obsidian syntax bare rp8 lacks; and `strict` simply stays on micromark. The port is done.
`AGENTS.md` § "2.0" is the operational record; this is the state and what is left.

## State

|                                      |         1.x (micromark) |                 2.0 (rp8) |
| ------------------------------------ | ----------------------: | ------------------------: |
| referee (6,844 documents)            |                   6,307 |                 **6,828** |
| contract gate, `match` cases         |                   3,447 |                 **3,451** |
| positioned-oracle divergences        |                      20 |                     **9** |
| RAW positions vs `compute`: sections |                   97.4% |                  **100%** |
| RAW positions: headings / list items |            94.2 / 82.2% |                 100/92.4% |
| round-trips that never settle        |                       0 |                     **0** |
| round-trips tolerated as converging  |                      19 |                     **6** |
| structural invariant violations      |                      10 |                     **0** |
| slowest gated pathological shape     | 7.4 s (`footnote-refs`) | 985 ms (`unclosed-links`) |

Suite 465 passed / 3 skipped, lint, both typechecks, format and build green. Commits on
`rp8-legacy-prototype`: `6aa9bfa` prototype, `d73c42a` wiring, `6ba3e8e` vendoring and
performance, `b1ac5d0` the API change, round-trip and re-pinned ceilings.

## What is left

1. **Dead code.** Every micromark construct and pass reachable only through the 14 internal
   `legacy*` switches is now unreachable: `legacy` never runs micromark and `strict` turns them
   all off. (They were never released as options -- no published tarball carries them -- so the
   options were removed outright.) Removing it is pure deletion, gated by `strict.test.ts` (whose output cannot
   change) and the suite. It is most of `src/lib` and would shrink the 726 KB bundle.
2. **`strict`'s unconditional passes.** 57 passes run under both presets; 51 own no spec example.
   They existed to match Obsidian, which `legacy` no longer needs them for. Each is now a
   question for `strict.test.ts` alone: keep, gate, or remove.
3. **The 16 referee documents.** 4 are P1/P2 (must not fix); 2 carry references on lines past the
   text's end (artifacts of the corrected answers); 4 carry references only the corrected answers
   have, inside code or an unclosed fence (`reproducers.json#852` is the one 1.x got right); 6
   are definition or reference COLUMNS -- BOM, two RTL names, a frontmatter closer, two off by
   one to three.
4. **The positioned oracle's 9** -- all pre-existing in 1.x; none new.
5. **`normalize.ts`** carries compensations for micromark's offsets. Only rp8 trees reach it now
   (every gate runs the `legacy` profiles), and two compensations already had to be generalised
   because they broke rp8 positions that were right. Simplifying it is safe but unmeasured.
6. **Instruments.** `pass-owner*`, `ablate*`, `mechanism.mts` and their kin attribute behaviour to
   micromark passes `legacy` no longer runs.
7. **Release.** 419 pending changesets, almost all micromark-era fixes, will land in the 2.0
   changelog beside `legacy-remark-parse-8.md`; curate them. The goldens were last recorded
   against Obsidian 1.14.5.
8. **rp8 and the four upstream pathological exceptions** (`nested-blockquotes`, `delimiter-run`,
   `list-dash-sandwich`, `callout-nest`) exceed 60 s on both parsers. Not a regression, and not
   yet measured for whether rp8 throws or hangs.

## Before changing anything under `src/rp8`

Run `test/rp8-vendored.test.ts` and `test/rp8-speedups.test.ts`, and read `src/rp8/vendor/README.md`
for the changes made to vendored files after conversion -- re-running `scripts/vendor-rp8.py`
overwrites them.
