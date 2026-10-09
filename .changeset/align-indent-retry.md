---
"@quartz-community/remark-obsidian": patch
---

A footnote label keeps its backslash inside a container.

`alignToSource` rebuilds a text node's value from its source so a spliced reference gets
an exact position. A paragraph inside a container defeated it -- the source carries the
continuation indent and the value does not -- so the alignment was dropped and the label
came from the value, where micromark had already resolved the escape. The strict pass is
now followed by one that skips whitespace after a line ending, with `at[]` still recording
every kept character's real offset.

Two cases, and 20 previously unplaced nodes now carry exact positions.
