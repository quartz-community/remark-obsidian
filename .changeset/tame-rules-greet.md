---
"@quartz-community/remark-obsidian": patch
---

Correct the callout marker rule, which was wrong in four ways.

The author of Obsidian Footnotes Shortcuts sent a list of places Obsidian
deviates from stock remark, and our own recorded goldens confirm every
callout point in it. The marker is stricter than we had it:

- It binds to `>` plus **at most one space**. `>  [!note]` is an ordinary
  quote, and by the time the tree exists that second space is gone — the
  tokenizer ate one and the paragraph starts at the other — so the source
  line has to be consulted.
- It must end the line or be followed by a space or tab. `> [!note]x` and
  `> [!note]-x` are quotes, not callouts with a title.
- A fold marker must touch the bracket.
- The type may contain inner whitespace (`> [! note]` reads "Note") but may
  not be empty (`> [!]` is a quote).

Six corpus cases move to matching, with no regressions.
