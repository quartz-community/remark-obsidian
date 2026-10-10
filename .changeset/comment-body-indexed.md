---
"@quartz-community/remark-obsidian": patch
---

A link, embed or tag inside a `%%` comment is now indexed.

`%%[[target]]%%` is reported as a link by Obsidian — a comment hides its body when
rendering but still indexes what is inside it — and the projection skipped comment bodies
entirely.
