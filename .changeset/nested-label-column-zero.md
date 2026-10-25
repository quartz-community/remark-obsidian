---
"@quartz-community/remark-obsidian": patch
---

A nested footnote label at column 0 is a reference, not a definition.

A definition's enders are only read within its first 1,024 characters (rule E4), so where a
definition's text runs longer than that, a following `[^9]:` at column 0 cannot end it — Obsidian
swallows the label as text and indexes it as a bare reference. We were nesting it as a
definition, which is both a surplus definition and a lost reference.

    referee assertions 23347 -> 23348
