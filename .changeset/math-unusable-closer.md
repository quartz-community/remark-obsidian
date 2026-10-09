---
"@quartz-community/remark-obsidian": patch
---

A dollar that cannot close an inline span is content, not the end of the attempt.

A single-dollar closer may not sit straight after a space, and the scan now goes on to
look for one that can: `$$$], $x^2$` is one span holding `], $x^2`. Abandoning at the
unusable closer let the interior dollar open a span of its own. `$. $` is still literal --
it runs out of input rather than giving up early.
