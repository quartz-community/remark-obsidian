---
"@quartz-community/remark-obsidian": patch
---

Accept a reference destination after the outermost label

`[a [b](u)][r]` is a reference to `r` whose text reads `a [b](u)` — the same
outermost-pair rule as the inline form, with `[r]` where `(u)` would be. That closes
CommonMark's spec examples 532, 533 and 535 through 538.

A reference destination is itself a bracket pair, so the scan offers it as the next label:
`[foo][bar][baz]` had `[bar]` — already spent as `[foo]`'s destination — relabelled and
pointed at `[baz]`. Labels beginning before the last destination's end are skipped.
