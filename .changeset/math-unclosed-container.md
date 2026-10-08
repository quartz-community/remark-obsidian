---
"@quartz-community/remark-obsidian": patch
---

An unclosed `$$` indented into a container stays literal text.

`> $$y^2` is a blockquote whose rendered text is the literal `$$y^2` with no formula at
all, and the same holds for a tab-indented `$$y` under a task. Close the run and it is math
again, and an opener alone on its line still opens one — `> $$` over a lazy line is math
holding that line.
