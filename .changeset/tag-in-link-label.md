---
"@quartz-community/remark-obsidian": patch
---

Fixes a regression: a `#tag` inside a link label is a tag again.

`[#tag]`, `[#tag](u)` and `[#a/b]]` all report a tag in Obsidian. Refusing a tag after any
label opener — added to stop ` ![[#t` reporting one — was too broad and suppressed all of
them. The refusal now applies only to a doubled opener, `[[` or `![[`, where a `#`
introduces a heading fragment rather than a tag.
