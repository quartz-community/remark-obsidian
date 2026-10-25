---
"@quartz-community/remark-obsidian": patch
---

A 4-space label line continues the footnote definition above it.

`[^1]: one` over `    [^2]: two` is one definition to Obsidian, whose text runs across both lines
(rule E2). Stock `remark-parse` + `remark-gfm` nests a second `footnoteDefinition` inside the
first instead, and no option of this package moved it, so the nesting was inherited rather than
introduced. The label is now left in the parent's text as the source wrote it, which is what
lets the bare-reference pass index it — Obsidian declines the definition but still reports a
reference at its position.

Exactly four spaces, and only with no blank line above: a blank line makes Obsidian define after
all, and six columns is an ordinary nested definition.

    referee 6239 -> 6247
