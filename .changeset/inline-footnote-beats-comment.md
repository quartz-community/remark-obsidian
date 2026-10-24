---
"@quartz-community/remark-obsidian": patch
---

A footnote reference inside an inline footnote stays dead when a `%%` comment is nested in it.

`inlineFootnoteInertTransform` demotes a reference inside `^[ … ]` to literal text, which is the
rule. `commentParseTransform` runs later and re-parses a comment's body through the whole chain,
so a `%%` nested inside an inline footnote rebuilt the reference the earlier pass had just
removed:

    a^[x %% [^1] %% y] w[^2]     indexed `[^1]`, which Obsidian does not

Two rules claim that range: everything inside `^[ … ]` is dead, and a reference inside `%%` is
still indexed. The live oracle settles which wins, with a control pair — `^[x [^1] y]` reports
only `[^2]` with no comment present, and `%% [^1] %%` alone DOES report `[^1]`. So inline-footnote
inertness takes precedence and the comment rule applies outside one only. The demotion now runs
again after the comment parse.

    referee 6236 -> 6237 / 6818   +1 GAINED, 0 LOST
    probe:e3                      1 of 21 -> 0
