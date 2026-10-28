---
"@quartz-community/remark-obsidian": patch
---

The largest families a million-document fuzz found, fixed.

- **Emphasis around a `*` (`legacy`):** emphasis around a formula, code, a wikilink, a comment,
  a footnote label or nested emphasis holding a `*` (`_$a*b$_`, `_![[*em*]]_`, `_[*em*](u)_`)
  is written with `_`. Written with `*`, remark-parse 8 closed it early.
- **Runs of `=`:** a run of three or more `=` (`======`, `# ========`) is written so no pair in
  it opens a highlight, under both presets.
- **Footnote definitions (`strict`):** whitespace-only lines of a `$$` block inside a definition
  no longer grow by four spaces on every format, as was already fixed for code.
- **Fence-like lines (`legacy`):** a line starting `~~~`, an empty strikethrough at a line start,
  and strikethrough text starting with `~` are written so they cannot open a code fence once
  the line's indent is gone.
- **Positions (`strict`):** a callout's body over a line holding a literal URL no longer starts
  inside the title. A `%%` comment after a blank line in a footnote definition is a block of its
  own, as `legacy` reads it, instead of being folded into the definition's first paragraph.
