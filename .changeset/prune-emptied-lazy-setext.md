---
"@quartz-community/remark-obsidian": patch
---

A node is no longer left with a negative span when a lazy setext underline takes its only
line away. `> [!note] title` / `[^1]: def` / `---` produced a `footnoteDefinition` starting at
offset 16 and ending at 15; the node is now dropped instead, which is also what Obsidian
reports for it -- a definition absorbed as a container's lazy content is not a definition.
