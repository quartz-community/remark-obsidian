---
"@quartz-community/remark-obsidian": patch
---

Take the column count of a short delimiter row from the delimiter.

`| a | b |` over `| --- |` built a table whose `align` followed the header, so
it declared two columns. Obsidian renders `a` alone, measured through a real
Reading View rather than the detached renderer the recorder batches — both
agree, which contradicts the note previously attached to this case.

`align` now follows the delimiter, which is what declares the columns. The
surplus cell stays in the tree, so a rewrite can still restore it; it is
dropped only when rendering, the same split the undefined footnote reference
uses.
