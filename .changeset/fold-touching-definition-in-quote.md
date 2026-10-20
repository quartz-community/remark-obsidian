---
"@quartz-community/remark-obsidian": patch
---

A second footnote definition under quoted prose folds like the first.

A definition may not interrupt a paragraph, and `footnoteInterruptTransform` folds one that tries.
Its adjacency test required a leading `\n` in the gap between the paragraph and the definition —
which cannot be satisfied when the two nodes _touch_. Inside a quote that is exactly what a folded
predecessor leaves behind: folding `> a` / `> [^1]: d` stretches the paragraph to offset 16 and the
next definition starts at 16, because micromark bounds a definition in a quote up to the next block
rather than to its own last character.

So `> a` / `> [^1]: d` / `> [^2]: e` folded the first and defined the second, where Obsidian defines
neither. At root the same chain works because the spans do not touch, which is why this was
invisible outside a container. Measured against the reference stack, `remark-parse@8` +
`remark-footnotes@2` reports no definitions for either shape and micromark reports both.

An empty gap now counts as adjacent, guarded by `previousLineHasContent`: an empty gap also arises
when the previous node's span swallowed a blank line, which an indented fence does, and folding
there lost two documents of the form `<4sp>```` / text / `[^x]: …`/`<4sp>````.

Footnote agreement moves from 6018/6818 to 6028/6818 with zero regressions, verified by identity.
Seven probes against live Obsidian now agree where four did.
