---
"@quartz-community/remark-obsidian": patch
---

A blank line ends a footnote definition, even with an unclosed `%%` inside it

The comment is bounded by the definition and the definition by its blank line, so
an opener with no closer reaches the definition's end and no further:

```
[^1]: one          the definition ends on the `%%` line, and
%%                 `use[^1]` below the blank is a live reference

use[^1]
```

Five probes recorded against Obsidian 1.14.4 settle it, including the case that
must not change: `[^1]: one` / `%%` / `b` has no blank, so `b` continues the
definition lazily and the `%%` does not end it.

Scoped to a definition deliberately. The same rule stated globally is wrong — at
the top level an unclosed `%%` runs to the end of the note, blank lines and all,
which a committed golden pins. Only a container that is itself blank-line
terminated bounds the comment this way.
