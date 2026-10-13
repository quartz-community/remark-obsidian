---
"@quartz-community/remark-obsidian": patch
---

Lift a column-zero `%%` out of the container above it. `- item` / `text` / `%%` and
`> quote` / `%%` report two root sections in Obsidian, with the comment running to the end of
the note; the comment was left a direct child of the `listItem` or `blockquote` with its
extent stopping at the container's end. The swallowed content becomes the comment's children,
so every reference stays in the tree. Fixes 16 three-element and pair compositions.
