---
"@quartz-community/remark-obsidian": minor
---

Add the `inertFootnoteRefs` option, off by default. A footnote reference inside an inline footnote
stays a `footnoteReference` with `data: { inert: true }`, where it was text: `^[x [^2] y]` holds a
dead reference to `2`, defined or not. Obsidian reads no reference there, so the node refers to
nothing. It is for a consumer reading the tree, a linter reserving a name, say, and is the same
idea as `parseComments` for `%%`. `mdast-util-to-hast` renders every `footnoteReference` as a live
call, so a chain that renders should leave it off.
