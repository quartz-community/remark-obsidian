---
"@quartz-community/remark-obsidian": patch
---

A list item's ownership threshold and its content column are now separate quantities.

They differ for a capped single-digit-dot item: `1.` followed by five spaces consumes three
columns of prefix, while its content column is four, because `1.` counts one more column than it
occupies. One field was serving both roles, so every change that was right for one was wrong for
the other.

Ownership keeps the narrower number, which is what CommonMark requires — in `1.` five-spaces
`indented code`, a blank, three-spaces `paragraph`, a blank, seven-spaces `more code`, the last
line has to be four columns past the item's content and therefore code. The flow gets the wider
one, so a footnote label seven columns in is three past the content column and stays a
definition instead of being swallowed by an indented code block.

The de-indentation minimum now applies to both: a line shallower than the content column lowers
it, which is what lets those two cases coexist — the first has an intervening shallower line and
the second does not.
