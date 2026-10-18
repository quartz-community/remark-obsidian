---
"@quartz-community/remark-obsidian": patch
---

The marker-plus-tab definition rule now covers every separator width and indented markers.

`+` tab three spaces `[^1]: def` and `   -` tab two spaces `[^1]: def` are definitions in
Obsidian. The rule shipped for this family only reached the narrowest separator, because the
code node it re-parses keeps whatever indent exceeded the four columns stripped from it — so
its value arrives as `" [^1]: def"` with a leading space for every wider separator.

`probe/def-tab/marker-tab-spaces` has been a known gap since the tab family was first explored
and now matches.

Referee agreement 5844 to 5851 of 6818 documents, the code-range dimension unchanged, and no
corpus regressions.
