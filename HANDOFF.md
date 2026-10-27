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
| contract gate, `match` cases         |                   3,447 |                 **3,465** |
| positioned-oracle divergences        |                      20 |                     **9** |
| RAW positions vs `compute`: sections |                   97.4% |                  **100%** |
| RAW positions: headings / list items |            94.2 / 82.2% |                 100/92.4% |
| round-trips that never settle        |                       0 |                     **0** |
| round-trips tolerated as converging  |                      19 |                     **6** |
| structural invariant violations      |                      10 |                     **0** |
| slowest gated pathological shape     | 7.4 s (`footnote-refs`) | 985 ms (`unclosed-links`) |

Suite 453 passed / 3 skipped, lint, both typechecks, format and build green. Commits on
`rp8-legacy-prototype`: `6aa9bfa` prototype, `d73c42a` wiring, `6ba3e8e` vendoring and
performance, `b1ac5d0` the API change, round-trip and re-pinned ceilings.

## What is left

1. **Dead code -- DONE.** The 41 modules reachable only through the internal `legacy*` and
   `taskReparse` switches are deleted, 8,716 lines, along with the switches themselves. The
   output is byte-identical on 70,499 fingerprints with a known-positive control (AGENTS.md
   § 2.0), and the bundle drops from 755,021 to 564,319 bytes.
2. **`strict`'s passes -- DONE.** 76 call sites → 17, by the intends/delivers rule; AGENTS.md
   § 2.0 has the measurement. Left open, all smaller:
   - `needsTransform` skips the whole chain when `comments`, `customTaskChars`, `math`,
     `callouts` and `bareFootnoteRefs` are all off, so `positionedBreaks`, `lineOffsets` and
     the frontmatter repairs silently do nothing then. Predates 2.0; a behaviour change.
   - A `%%` closer's tail inside a QUOTE stays hidden in the comment: `commentTail` repairs it
     at root only (`hunt/label-after-comment-closer-mangled/3`).
   - The syntax extensions `strict` keeps were tuned against Obsidian too -- the highlight
     scan (`legacyHighlightQueue`, shared with the rp8 reader), the callout and comment
     grammars, tags, inline footnotes. Whether each rule is documented or merely delivered is
     the same question one level down.
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
   changelog beside `legacy-remark-parse-8.md`; curate them. Some now describe deleted code,
   e.g. `legacy-container-lazy-and-link-destinations.md` and `task-reparse-children-start.md`. The goldens were last recorded
   against Obsidian 1.14.5.
8. **rp8 and the four upstream pathological exceptions** (`nested-blockquotes`, `delimiter-run`,
   `list-dash-sandwich`, `callout-nest`) exceed 60 s on both parsers. Not a regression, and not
   yet measured for whether rp8 throws or hangs.

## Before changing anything under `src/rp8`

Run `test/rp8-vendored.test.ts` and `test/rp8-speedups.test.ts`, and read `src/rp8/vendor/README.md`
for the changes made to vendored files after conversion -- re-running `scripts/vendor-rp8.py`
overwrites them.
