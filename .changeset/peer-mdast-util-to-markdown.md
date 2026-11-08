---
"@quartz-community/remark-obsidian": patch
---

Declare `mdast-util-to-markdown` `^2.2.0` as a peer dependency. The Markdown writer this package adds to `remark-stringify` relies on `mdast-util-to-markdown` 2.2's attention handling; with 2.1.x in your tree (as `remark-stringify` 11 can resolve), serialising emphasis recursed until the stack overflowed. npm now installs 2.2 alongside this package, and `remark-stringify` uses it.
