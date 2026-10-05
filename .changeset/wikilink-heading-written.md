---
"@quartz-community/remark-obsidian": patch
---

Render a wikilink's heading as written, keeping a trailing backslash

Obsidian resolves `[[a#^blk\]]` to the heading `^blk` while still _displaying_
`a > ^blk\`. The path already carried that pair — the resolved target stripped and
the written form kept for rendering — but the heading did not, so `value` was built
from the stripped heading and dropped a character the app shows.

Measured on the recorded corpus: 13 cases move from `replicate` to `match` with no
regression, reaching past wikilinks into embeds, a callout, a table and an inline
footnote.
