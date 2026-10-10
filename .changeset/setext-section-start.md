---
"@quartz-community/remark-obsidian": patch
---

A setext heading overlapping a link reference definition starts at its content's line.

`[ref]: /url` / `para` / `===` reports the heading at line 1, where it had been reported
at line 0 and overlapped the definition.
