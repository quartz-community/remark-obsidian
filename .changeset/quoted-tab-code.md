---
"@quartz-community/remark-obsidian": patch
---

A footnote reference on a quoted tab line below an empty `>` is no longer indexed.

`>` followed by `>` tab `code[^2]` is indented code to Obsidian, so the brackets are literal and
no reference is reported. We indexed one. The same holds below a callout title, and the control
that fixes the rule's shape is `> plain` followed by the same tab line — there the quote has an
open paragraph, the tab line continues it lazily, and the reference **is** indexed.

It does not apply while a footnote definition is still open above the blank quoted line. A
definition continues across an empty `>`, so the tab line is its content rather than a fresh
block, and Obsidian indexes the reference there — its own recorded definition span reaches the
tab line, which is what settles it.

The reference becomes literal text carrying its own characters rather than being removed, so a
formatter rewriting the line cannot lose the brackets.
