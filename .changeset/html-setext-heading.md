---
"@quartz-community/remark-obsidian": patch
---

A setext underline directly under a raw HTML line makes a heading

Obsidian reads `<br>` over `===` as a heading named `<br>`, and the tag is
irrelevant — `<div>`, `<span>`, `<p>`, `</div>` and an unknown `<x-tag>` all behave
the same. What matters is that the underline is the **second** line: `<div>` / `a` /
`===` keeps its html block, and `<pre>` / `---` / `</pre>` becomes a heading plus an
html block holding `</pre>`.

micromark opens an HTML block for the whole run, so the underline was swallowed and
no heading appeared.

The heading's content is inline html rather than text, which is what makes both
oracles agree at once: the browser renders `<br>` as an element so the heading's
rendered text is empty, while `metadataCache` still reports the raw `<br>` it read
from the source.

16 of 17 new `probe/html-block/*` cases match, from 8 before.
