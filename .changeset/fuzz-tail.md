---
"@quartz-community/remark-obsidian": patch
---

The rest of what the invariant fuzzer found in its first 5,000 seeds. Every one of them now
formats to the same words, under every preset and option set.

- **Comments (`strict`):**
  - A comment two quotes deep, or opened on a lazy line, read part of its own body as a quote.
  - An unclosed comment two quotes deep swallowed a lazy line and `---` that Obsidian reads as
    a heading.
  - A defined footnote reference inside a comment was left as text; Obsidian indexes it.
- **Emphasis spellings:**
  - remark-parse 8 reads `_***x***_`, `_u_**strong**` and `_[^*em*]_` only as written. The
    `legacy` writer now writes them so.
  - A tag ending emphasis or strong no longer swallows a `_` closer, under either preset.
- **Link text (`legacy`):** wikilink brackets inside link text (`[[[[target]]](link](u)`) keep
  the link.
- **Line breaks and formulas:**
  - A line break that opens emphasis or strong is written with a backslash, so a tag after it
    survives.
  - A formula line that would read as a setext underline under a quote is joined to the line
    above.
- **Literal URLs (`strict`):** a `[^https://…]` label on an indented continuation line is a
  reference, as on one line.
- **Ampersands:** a `%%` straight after a comment, and an `&` after a character reference
  anywhere in the text, keep their meaning when formatted.
