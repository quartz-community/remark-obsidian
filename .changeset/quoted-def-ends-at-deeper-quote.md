---
"@quartz-community/remark-obsidian": patch
---

A footnote definition inside a blockquote now ends at a line quoted more deeply than itself.

`> [^1]: def` followed by `> > quoted` ran the definition over the nested line, so its span was
too long and anything indexed there belonged to the wrong definition. A line at the same depth
or shallower is unchanged, and a definition at the top level is unaffected.

Referee agreement 5829 to 5841 of 6818 documents, the code-range dimension unchanged at 742 of
883, and no corpus regressions.
