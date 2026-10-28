---
"@quartz-community/remark-obsidian": patch
---

Formatting keeps a document's words in five more shapes, and settles despite an upstream bug.

- **Footnote definitions (`strict`):** a whitespace-only line of code inside a definition no
  longer grows by four spaces on every format. `micromark-extension-gfm-footnote` leaves the
  definition's indent on such a line; that indent now comes off, giving the value `legacy`
  reads.
- **A `^` before a wikilink or link** is escaped, so `^[[…]]` does not re-read as an inline
  footnote.
- **Formulas:**
  - A formula ending in a `$` after whitespace, which the reader stepped over, is written as
    read.
  - A `$$` formula starting a line is written so it cannot open a math block.
- **`legacy`:** link reference text holding an embed of `]` keeps its brackets. Emphasis that
  starts with strong is written with `_`, as remark-parse 8 pairs it.
