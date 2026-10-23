---
"@quartz-community/remark-obsidian": minor
---

Add `legacyLinkDefinitions`, so the strict preset decides link reference definitions the way
CommonMark does.

`legacyDefinitionTransform` and `legacyDefinitionPromoteTransform` ran unconditionally despite
being named for the legacy reading. `remark-parse@8` admits a definition CommonMark rejects and
promotes one CommonMark leaves as paragraph text, so `strict` emitted a `paragraph` where
CommonMark emits a `definition` on six spec examples:
`commonmark/link-reference-definitions/196`, `200`, `202`, `210`, and `commonmark/links/546`,
`552`.

    strict divergence from stock remark-parse + remark-gfm   26 -> 20 of 652
    legacy referee                                           6208/6818, BYTE-IDENTICAL
    main parity gate green, 453 tests, 0 probes drifted, 4 gates green

Distinct from `labelPrecedence`, which governs how a link label's brackets are scanned; this one
governs whether the definition forms at all. It defaults to `true` and is cleared by
`preset: "strict"`, so `legacy` consumers see no change — verified by `--ids` identity rather
than by an equal total.

`link-reference-definitions/216` and `links/493` are NOT covered by this flag and remain
recorded: they have a different cause, which is why the measurement was taken before the option
was written rather than after.
