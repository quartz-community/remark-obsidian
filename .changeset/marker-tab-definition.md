---
"@quartz-community/remark-obsidian": patch
---

A list marker followed by a tab and up to three spaces still opens a footnote definition.

`-` then a tab then two spaces then `[^Note]: def` is a definition at column 2 in Obsidian.
This package read the item's content as indented code, so nothing was defined and the
reference to it dangled. A tab plus four spaces is code on both sides and is unchanged, as is
a wide `10.` marker, which never crossed the threshold.

Restricted to items at the top level: an equally indented marker nested inside another item
defines nothing in Obsidian, which the probes confirm.

Referee agreement 5827 to 5829 of 6818 documents, the code-range dimension unchanged at 742 of
883, and no corpus regressions.
