---
"@quartz-community/remark-obsidian": patch
---

A blank line ends a footnote definition before a thematic break

`setextDefinitionTransform` absorbs a `---` below a definition and makes a heading of the
whole line. Its gap check used `trim()`, which a blank line passes — so `[^1]:` / blank /
`---` became one heading spanning both, where Obsidian reports the definition and the
thematic break as the separate blocks they are.

An adjacent underline is still taken, which is the rule the pass exists for.
