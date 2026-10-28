---
"@quartz-community/remark-obsidian": patch
---

Formatting now reads back as the same tree in many more documents, not only the same words:

- A wikilink target keeps a backslash before `]`, as Obsidian does: `[[a\]b]]` links to `a\]b`
  under both presets, and `strict` no longer ends the link at the escaped bracket.
- A task box over a block other than a paragraph (a footnote definition, a heading, code) is
  written back, where it was dropped.
- A callout whose title line holds a block (`> [!note] [^1]: def`) is written that way, so the
  block stays on the title line; code, `%%` comments and paragraphs are written below the marker
  instead.
- A wikilink target is written as the author spelled it: a no-break space in a target and
  decomposed accents no longer come back normalized.
- An empty task item (`- [ ] `) keeps its box.
- A line holding only a no-break space after a line break is written `&#xA0;`, which
  remark-parse 8 does not read as a blank line.
- Emphasis inside emphasis that ends in a tag is written `_*#tag*_`, not `**#tag**`.
- An empty `$$$$` formula at a line start keeps its `&#x20;` prefix.
- Under `strict`, an inline footnote that `[^` turns back into text keeps what it held:
  `[^[^<https://e.test>]]` keeps its autolink instead of flattening it to text.
- A `%%` comment that is a block of its own stays one.
- Under `legacy`, a footnote definition with several blocks inside a list item keeps them all.
- A run of `#` after an escape is escaped in full, so `\######x` stays text.
- Under `strict`, a callout's `title` follows its title nodes after the reading pass.
- A single-line formula with content no longer gets an `&#x20;` prefix.
