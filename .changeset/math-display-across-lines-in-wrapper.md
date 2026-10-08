---
"@quartz-community/remark-obsidian": patch
---

Display math inside emphasis is recognised when it spans a line ending.

`_$$y^2` over `y^2$$_` is one display math inside an emphasis in Obsidian. A legacy wrapper
must emit every line ending as its own token, so the span could not cross one and arrived as
two text nodes and a `break`. The paragraph is now re-tokenized through the existing refold
pass, which already replaces line endings with spaces length-preservingly for the same
reason on highlights.
