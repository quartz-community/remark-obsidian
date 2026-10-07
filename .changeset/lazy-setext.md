---
"@quartz-community/remark-obsidian": minor
---

A setext underline takes a quote's last lazy line away from it.

`> a` / `b` / `---` is a blockquote holding only `a` in Obsidian, with `b` and the
underline forming a heading at root. CommonMark lazily continues `b` into the quote and
leaves the run as a thematic break, so the heading never appeared.

Three measured details, each a case this would otherwise get wrong:

- only the **last** lazy line leaves, so `> a` / `b` / `c` / `---` keeps `b` in the quote
- a line that is actually quoted never leaves, which keeps `> a` / `---` a quote plus a
  break and `> a` / `===` a quote that absorbs the run
- a **list** is the other way round and absorbs its lazy line instead
