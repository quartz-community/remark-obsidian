---
"@quartz-community/remark-obsidian": patch
---

Compare the block attributes no projection read.

`text` compares what a block says, never what it is. A table's column
alignment, a fence's language and an ordered list's starting number all live
in mdast fields nothing looked at — and that is not academic, since the
delimiter row's column count was changed in this package with no projection
able to catch an error in it.

Obsidian's side comes from the HTML already stored in every golden, so this
needs no re-recording. Agreement is 1528 of 1531, and the three that differ
are real: `| :: |` builds a centred table in Obsidian and none here, and a
tilde fence's info string is kept as a language here where Obsidian discards
it.

Getting there meant fixing four artifacts of the extractor rather than of the
parser: the renderer appends footnote definitions as their own list, nests a
second container for inline footnotes, paints frontmatter as a yaml fence, and
falls back to `language-none` when an info string cannot be a class name.
