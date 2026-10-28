---
"@quartz-community/remark-obsidian": patch
---

More of the million-document fuzz's families, fixed.

- **Labels holding a wikilink (`strict`):** a footnote label holding a wikilink across a quote's
  continuation line (`> [^[[a#^blk]` / `> 00]]`) no longer gains a `>` on every format. A
  footnote label holding `[[` inside link text keeps the link.
- **Tags:**
  - A tag on a bracket pair split over lines (`[^1` / `1]#tag`) keeps its tag.
  - The text `#tag` at the start of link text stays text.
  - In `legacy`, whitespace opening bold before a tag no longer hides the tag.
- **Formulas:** a `$$` formula holding a single backslash (`$$ \ $$`) reads back the same.
- **Strikethrough (`legacy`):** a `~` against a strikethrough's delimiters no longer closes it
  early.
