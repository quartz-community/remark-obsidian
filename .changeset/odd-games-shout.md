---
"@quartz-community/remark-obsidian": patch
---

Require a setext underline to stand alone, as `remark-parse@8` does.

CommonMark allows up to three spaces of indent before the run and any
whitespace after it. remark-parse@8 allows neither, so `H` over `  ===` and
`para` over `===⇥` are plain paragraphs to Obsidian where we reported headings.
Measured against the legacy stack, every variant agrees: a leading space, a
trailing space and a trailing tab each cancel the heading.

Demoting matters beyond the heading itself. A definition on the next line
cannot interrupt a paragraph, so once the heading is prose again the definition
folds into it — which is how `H` / `  ===` / `[^1]: real` becomes the single
paragraph Obsidian reports, rather than a heading plus a definition whose body
would render in the wrong place.

Two corpus cases.
