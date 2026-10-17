---
"@quartz-community/remark-obsidian": patch
---

An unclosed `%%` that is a list item's own content now swallows the blocks below it, as one
opened inside a blockquote already did.

A definition buried that way stops defining and its label is indexed as a reference instead,
which is the asymmetry Obsidian applies to every commented definition. Previously the
definition stayed live, so a footnote Obsidian does not define was defined and the reference
it does index was missing.

The comment is bounded by lazy continuation, so a blank line, a marker, an ATX heading or a
fence below the opener ends it rather than the end of the note. A `%%` indented four columns
past the item's content is indented code and opens nothing, which needs no code here -- the
tokenizer already produces `code` rather than `comment` for it.

Referee agreement 5745 to 5762 of 6818 documents, with no corpus regressions.
