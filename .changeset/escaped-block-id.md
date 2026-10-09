---
"@quartz-community/remark-obsidian": patch
---

An escaped bracket no longer hides a block identifier.

`\[^1` leaves a literal `[` with the caret free behind it, so the trailing `^1` is an
ordinary block identifier -- Obsidian registers it and renders only `[`. An _unescaped_
`[^1` opens a footnote reference that claims the caret, and registers nothing.

A `]` run may follow the identifier when an unescaped `[` is still outstanding, counted
over the block: `[[\[^1]` and `[\[^1]]]` register while `\[^1]` does not, and neither does
`# ![[[[link](u)]]](\[^1]`, whose four openers are all already closed.

Eleven cases, including the three `probe/escaped-label/*` the family was named for.
