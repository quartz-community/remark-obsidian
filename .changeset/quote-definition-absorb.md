---
"@quartz-community/remark-obsidian": patch
---

A footnote definition inside a blockquote absorbs the quoted line below it.

`> Q1` / `>` / `[^1]: def` / `> Q2` puts the definition inside the blockquote — the `>`-only line
ends the quote's paragraph but not the quote — and Obsidian reads the line below as the
definition's own content. Our tree already nested the definition correctly; only its end was
short, leaving that line as an adjacent sibling.

The line is absorbed when it cannot interrupt a paragraph: ordinary text and indented code do,
fences, headings and list markers do not. A blank line, a `>`-only line, and a deeper `> >` all
stop it.

    referee 6285 -> 6291
