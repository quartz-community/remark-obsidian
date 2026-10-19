---
"@quartz-community/remark-obsidian": patch
---

After a blank line, a list item judges its content against the column it opened with.

An item's content column falls as shallower lines arrive — that is `remark-parse@8`'s
de-indentation minimum and it is why a wide-separator item can hold content at all. A blank line
ends that: lines after it are measured against the column the item started with, not the lowered
one.

`2)` five spaces `More` over two spaces `===` over a blank over two spaces `[^2]: body` is a
definition at **root**, column 0, in Obsidian. The separator caps the item's content column at
three; the `===` line at two columns lowered it to two before any blank was seen, and the label
at two columns then looked like ordinary content. Compared against the opening three it is
correctly shallower.

The control that bounds this is the same shape without the blank line, where the definition
really is the item's at column two — there the lowered floor still applies. Eight probes with
the intervening line, the blank, the separator width and the label indent varied independently.

This trades two documents on Obsidian's root code-block ranges for five on its footnote
positions: block counts shift in documents where an item previously kept a line across a blank
and now does not.
