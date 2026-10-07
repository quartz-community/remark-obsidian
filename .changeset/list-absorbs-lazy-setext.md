---
"@quartz-community/remark-obsidian": patch
---

A list absorbs the lazy line a setext underline would otherwise claim.

`- a` / `<br>` / `b` / `---` is one list holding `b`, with the `---` left as a thematic
break. CommonMark forbids lazily continuing a setext heading into a container, so micromark
hands back a root heading of `b` + `---` instead. A blockquote is the other way round and
does keep the heading at root, so this is restricted to lists.
