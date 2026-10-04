---
"@quartz-community/remark-obsidian": patch
---

End a footnote label at the first `]`, and read a stripped label from source.

GFM lets a backslash escape a bracket inside a footnote label, so `[^a\]b]: body`
is a definition named `a]b`. Obsidian stops at the first `]`, finds `b` rather
than `:` after it, and leaves the line as prose. Measured against the legacy
stack, `remark-footnotes` agrees with Obsidian.

Getting the rendered text right needed a second change. Obsidian does not apply
escapes while scanning a label either, so the leading `[^a\]` names `a\` and
keeps the backslash — but by the time a text node exists that backslash is
gone. The bare-reference pass now reads the label from the source span the node
came from rather than from its value, which is also what lets it tell `\[^9]`
from `[^9]`.

One corpus case, and the pair of them closes the escape-fidelity gap: a
formatter can no longer drop a bracket the author escaped, nor invent a
definition from a label Obsidian never closed.
