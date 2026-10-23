---
"@quartz-community/remark-obsidian": minor
---

Add `legacySetext`, so the strict preset stops reading setext underlines as Obsidian does.

Five setext passes ran unconditionally — `lazySetextTransform`, `containerSetextTransform`,
`setextUnderlineTransform`, `htmlSetextTransform` and `multilineSetextTransform`. There was no
setext option, so `preset: "strict"` had nothing to clear and Obsidian's reading applied
off-platform, where it helps nobody.

The effect was measurable and is now gated: six CommonMark spec examples —
`setext-headings/81`, `82`, `84`, `86`, `93` and `95` — emitted a `paragraph` where CommonMark
emits a `heading`. All six now agree.

    strict divergence from stock remark-parse + remark-gfm   32 -> 26 of 652
    legacy referee                                           6208/6818, BYTE-IDENTICAL
    main parity gate green, 453 tests, 0 probes drifted, 4 gates green

`legacySetext` defaults to `true` and is cleared by `preset: "strict"`, so **`legacy` consumers
see no change at all** — the referee's agreeing set is identical by `--ids`, not merely equal in
total.

`definitionSetextTransform` is deliberately left ungated: it is also a setext pass, but gating
the other five closed every measured divergence, and the smallest change that closes the
measurement beats the one that looks symmetrical.

This follows from the policy that any behaviour differing between `legacy` and `strict` belongs
behind an option rather than in an unconditional pass.
