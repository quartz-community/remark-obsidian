---
"@quartz-community/remark-obsidian": patch
---

Let an unclosed `$$` block opened in a container keep consuming.

CommonMark ends an unterminated block at the end of its container, so `> $$`
followed by an unindented `lazy` line closes the math and starts a paragraph.
Obsidian leaves the block open and swallows the line — and the swallowed text
stops being parsed, so a `[^1]` in it is part of a formula rather than a
footnote reference we would otherwise reduce to a bare name.

Scoped by measurement rather than by analogy. Against the legacy stack
`remark-parse@8` with `remark-math` agrees with Obsidian on exactly this shape,
and disagrees on the two neighbouring ones — an unclosed `<!--` escaping a
quote, and a mid-line `$$` — so neither is covered here. Only a sibling
starting at column 1 is absorbed, the same rule the unclosed fence uses.

One corpus case.
