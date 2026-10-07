---
"@quartz-community/remark-obsidian": minor
---

Give the outermost bracket pair the link

Obsidian finds a link label by raw balanced-bracket scanning, so the outermost pair wins
where CommonMark gives the innermost — `[a [b](u) c](v)` links to `v` and shows `[b](u)`
as written, and `[a [b [c](u) d](v) e](w)` links to `w`.

CommonMark forbids a link inside a link and resolves it the other way round, which is its
spec examples 518 and 526. A wikilink inside a label still resolves, and so does an
autolink: only a link written in bracket form is shown literally.

New `labelPrecedence` option. It shipped behind one because 369 corpus cases hold a nested
bracket pair; the measured cost of enabling it is **0 regressions**, so it is on by
default.
