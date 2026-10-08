---
"@quartz-community/remark-obsidian": patch
---

An inline `$` opener may be followed by a line ending.

`x^2$` over `y^2$$]]` is an inline formula holding `⏎y^2` in Obsidian: the opener ends its
line, the span crosses the ending, and the closer is the _first_ `$` of the `$$` run,
leaving `$]]` literal. Refusing on every whitespace left the whole run as plain text.
