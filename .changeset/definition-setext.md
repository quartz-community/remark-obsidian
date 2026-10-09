---
"@quartz-community/remark-obsidian": patch
---

A setext underline directly under a definition heads that line.

`[foo]: /url` over `===` is an `<h1>` reading `[foo]: /url` and creates **no** definition,
so the `[foo]` below renders as literal text. micromark consumes the definition first,
leaving the `===` with nothing to underline. The rule turns on adjacency: with a line
between, the definition survives and only that line heads.
