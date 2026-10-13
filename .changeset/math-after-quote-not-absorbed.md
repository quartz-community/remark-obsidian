---
"@quartz-community/remark-obsidian": patch
---

Stop absorbing an unclosed `$$` opener into a blockquote or callout. A list takes the opener
in as its own content, but a quote does not: `> quote` / `$$` reports a `blockquote` and then
a ROOT `math` node. Restricting the absorption to lists fixes eight three-element
compositions and one pair.
