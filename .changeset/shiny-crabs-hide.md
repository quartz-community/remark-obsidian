---
"@quartz-community/remark-obsidian": patch
---

Keep a `%%` from ending a footnote definition.

Obsidian recognises the definition first, so a `%%` inside one cannot open a
block comment: `[^1]: a` / `%%` / `b` is a single definition holding three
lines of prose. We opened a comment there, which ended the definition early
and left the following line as a paragraph of its own. The comment becomes the
text it was written as and the lazily continued lines fold back in.

This is the twelfth and last case from the Footnotes Shortcuts author's
deviation list.

The round-trip ceiling rises from 93 to 97. Those four are the escape
accumulation already recorded against that gate, reached by new shapes rather
than newly introduced: folding a lazy line back emits a `break`, and
`remark-stringify` writes a hard break as a trailing backslash that re-parses
as an escaped one, so each pass adds another. A more faithful parse therefore
raises that number, and the fix belongs in how these passes represent a folded
line.
