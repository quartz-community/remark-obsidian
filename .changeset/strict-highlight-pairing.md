---
"@quartz-community/remark-obsidian": patch
---

`strict` reads a line of many highlights (`==a== ==b== …`) in linear time. Checking each highlight
for emphasis opened before it paired every earlier emphasis run of the paragraph again; the
pairing is now carried forward from one highlight to the next. The trees are unchanged.
