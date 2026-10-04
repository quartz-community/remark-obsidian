---
"@quartz-community/remark-obsidian": patch
---

Re-tokenize a paragraph the block folds rewrote.

Inline tokenizing happens once, while parsing. A fold that later pulls a
definition label or a setext underline into a paragraph inserts text the
tokenizer never saw, so a delimiter inside it stayed literal: `para` /
`[^1]: a` / `===` / `[^2]: b` / `===` is one paragraph to Obsidian, which
highlights across the two `===` runs, while we kept them as text.

The paragraph's own source is re-parsed with its line endings replaced by
spaces, which forces a single paragraph — no setext underline, no definition —
so the tokenizer sees the whole run as inline content. The substitution is
length-preserving, so every offset still indexes the real source and each text
node is restored to the characters it actually covers, newlines included.

Only a paragraph where this produces a highlight that was not already there is
replaced, so the pass is inert everywhere else.

Also makes the highlight projection read an undefined footnote reference as
its bare label, matching the rendered text it is compared against.
