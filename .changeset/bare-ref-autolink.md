---
"@quartz-community/remark-obsidian": patch
---

A footnote reference inside an autolink is no longer indexed.

`see <https://e.com/[^1]>` produced a reference at the `[^1]`; Obsidian reads an autolink's
contents literally and indexes nothing there. The boundary is autolinks specifically — a
reference inside an ordinary link's text _is_ indexed, so widening this to every `link` would
cost 33 positions to gain 5.

    referee 6251 -> 6252
