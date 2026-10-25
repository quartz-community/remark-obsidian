---
"@quartz-community/remark-obsidian": patch
---

A `[^…]:` label containing whitespace is no longer recovered as a footnote definition.

`lrdFootnoteTransform` converts a link-reference definition with a `^`-prefixed identifier back
into a footnote definition, on the grounds that a label opening with `^` is always a footnote.
That does not hold when the label holds whitespace: the footnote reader declines such a label on
its own, so the link-reference reading is correct and converting it back invented both a
definition and a reference. Obsidian reads `[^a b]: hi`, `[^a\tb]: hi` and `[^a<!-- -->b]: hi`
as plain paragraphs, and `[^ab]: hi` as a definition.

A whitespace-_only_ label is excluded — `[^ ]: x` is the blank-label rule and is owned elsewhere.

    referee 6291 -> 6293
