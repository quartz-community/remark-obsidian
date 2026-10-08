---
"@quartz-community/remark-obsidian": patch
---

Indented display math keeps the separator after it.

`$$y^2$$` over `word` renders `⟨math⟩word` with no separator, but `··$$y^2$$` over `··[[`
renders `⟨math⟩ [[`. The suppression now applies only to display math beginning in
column 1, where the rendered element really is block-level.
