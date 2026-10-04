---
"@quartz-community/remark-obsidian": patch
---

Promote prose `remark-parse@8` would have read as a link reference definition.

The mirror of the pass added alongside it. A label may contain a nested `[`,
because the scan breaks only on `]`, so `[a[b]: /url` is a definition to
Obsidian while CommonMark leaves it as text. The two passes never collide: one
fires only where the port accepts, the other only where it rejects.

The port now returns the span it consumed along with the identifier, URL and
title, so the definition node can be built from what legacy actually parsed
rather than re-parsed through a tokenizer that disagrees with it. One corpus
case.
