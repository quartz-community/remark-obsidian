---
"@quartz-community/remark-obsidian": patch
---

An inline math closer may not sit straight after a space.

`$. $` renders literally in Obsidian where `$.$` is math, so the content may no more end in
whitespace than begin with it. `$$ $$` and `$a b$` are unaffected.
