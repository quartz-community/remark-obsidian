---
"@quartz-community/remark-obsidian": patch
---

A setext heading after a link reference definition reports the right start line.

`[ref]: /url` / `para` / `===` is reported at line 1 by Obsidian. Upstream gives the
heading a span that starts on the definition's line, so the two nodes overlap.
