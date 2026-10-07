---
"@quartz-community/remark-obsidian": patch
---

Refold a paragraph by how much it highlights, not by whether anything was highlighted

`inlineRefoldTransform` bailed the moment the paragraph already held a highlight, so
`H` / `  ===` / `[^1]: ==a==` kept the small highlight the first parse found and never
formed the large one Obsidian reports — which opens on the `==` of the former setext
underline and closes on the last `==` two lines down.

A paragraph can hold both a delimiter the tokenizer judged and one it never saw. The pass
now compares how many characters each reading highlights, which keeps it inert everywhere
the two agree.
