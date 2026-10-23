---
"@quartz-community/remark-obsidian": minor
---

Add `legacyContainerLazy` and `legacyLinkDestinations`, and extend `legacySetext` to the pass that
owns `link-reference-definitions/216`. This closes the strict preset's actionable backlog.

Six more passes ran unconditionally, with no option for `strict` to clear:

- `legacyContainerLazy` — `containerLazyTransform`, `listEmptyItemTransform`,
  `listDeepContinuationTransform`. `remark-parse@8` decides which following lines a list item or
  blockquote still owns by a different rule than micromark.
- `legacyLinkDestinations` — `angleDestinationEscapeTransform`, `linkNbspTitleTransform`. rp8
  resolves an escape inside an angle-bracketed destination differently, and treats a NO-BREAK
  SPACE as a destination/title separator where CommonMark does not.
- `legacySetext` now also gates `definitionSetextTransform`, which owns
  `link-reference-definitions/216`.

<!-- prettier-ignore -->
```
strict divergence from stock remark-parse + remark-gfm   15 -> 8 of 652
  by design (Obsidian syntax)   7
  position only                 0
  structural backlog            1   raw-html/626, already a recorded refusal
legacy referee                  6208/6818, BYTE-IDENTICAL
```

Every owner was derived by disabling one unconditional pass at a time and reading which spec
examples began to agree: 57 probed, 6 owning anything, 51 owning nothing. All five options default
to `true` and are cleared by `preset: "strict"`, so `legacy` consumers see no change — verified by
`--ids` identity rather than an equal total.
