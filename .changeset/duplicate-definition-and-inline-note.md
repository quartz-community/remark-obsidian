---
"@quartz-community/remark-obsidian": patch
---

Only the last definition for a label is rendered, and an inline footnote inside a skipped
one still is.

The recorded html shows both: `[^1]: > [!note] ![[[[word]]]]` over `[^1]: - [^1]` renders
the _second_ definition, so the first one's embed is never indexed; and
`[^1]: - ![[[[a|b]]]]](^[[[a#h]]]`, referenced nowhere, still indexes the `a#h` inside its
inline footnote because an inline footnote is self-referencing and gets relocated.
