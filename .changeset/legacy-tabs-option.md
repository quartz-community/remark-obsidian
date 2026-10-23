---
"@quartz-community/remark-obsidian": minor
---

Add `legacyTabs`, so the strict preset expands tabs the way CommonMark does.

CommonMark advances a tab to its next four-column stop everywhere. `remark-parse@8` does not: one
raw tab is a whole indent wherever it starts, and a tab after a space reaches no stop at all. Six
passes carried that reading across quotes, lists, thematic breaks and the indented-code
threshold, all of them unconditional, so Obsidian's tab arithmetic applied off-platform.

    strict divergence from stock remark-parse + remark-gfm   20 -> 15 of 652
    legacy referee                                           6208/6818, BYTE-IDENTICAL
    main parity gate green, 453 tests, 0 probes drifted, 4 gates green

Closed: `tabs/2` and `tabs/11` and `block-quotes/238` differed in node type; `tabs/6` and
`tabs/7` differed in position.

The six passes were derived rather than guessed. Fourteen tab and indent passes were probed one
at a time: four own exactly one example each — `quoteTabTransform`, `listTabTransform`,
`thematicBreakTabTransform`, `indentTabTransform` — and ten own none. `block-quotes/238` is owned
_jointly_ by `quoteIndentedCodeTransform` and `quoteLazyIndentedCodeTransform`, so both are in
the guard and neither closes it alone.

The ten that own nothing keep running. Most operate on footnote definitions, which the CommonMark
spec has no example of, so the spec cannot adjudicate them in either direction — gating them
would be an unmeasured change.

`legacyTabs` defaults to `true` and is cleared by `preset: "strict"`, so `legacy` consumers see no
change, verified by `--ids` identity rather than an equal total.
