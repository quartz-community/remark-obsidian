---
"@quartz-community/remark-obsidian": patch
---

A `%%` comment does not end a footnote definition.

`remark-footnotes@2` builds its interruptor list out of `remark-parse@8`'s own block methods
(`index.js:54-68`), so a construct rp8 never had cannot appear in that list and cannot interrupt a
definition. Our `%%` comment construct sits in `constructs.flow`, and the definition's block probe
asked the whole map — handing it an interrupting power rp8 does not give it:

    [^1]: body text / ⇥$$ / ␣␣%%        obs spans 3->5, we stopped at 4

`$$` math is deliberately NOT covered, and that is measured rather than assumed. The same
reasoning applies to it word for word — rp8 has no math either — yet excluding it costs 55
documents against 6 gained. Obsidian's math fence really does end a definition. Priced three
ways:

    commentFlow + mathFlow    +15 / -55
    mathFlow alone             +6 / -55     <- the whole loss is math
    commentFlow alone          +9 /   0     <- shipped

The filter is a deny list of rp8's absentees rather than an allow list of its methods, so that a
construct replaced under a new name keeps working: `legacyCodeFenced` is exactly such a
replacement, and rp8 does have fenced code, so it must keep interrupting.

    referee 6199 -> 6208 / 6818   +9 GAINED, 0 LOST, by --ids identity
    main parity gate green, 450 tests pass, 0 probes drifted, 4 gates green
