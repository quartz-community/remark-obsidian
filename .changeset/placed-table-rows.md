---
"@quartz-community/remark-obsidian": patch
---

Place the rows and cells a promoted table builds

`tableShortDelimiterTransform` constructs a `tableRow` and its `tableCell`s when a
short delimiter row declares fewer columns than the header. It received only the line
text, so none of those nodes could carry a span, and each cell's reparsed contents kept
the offsets they came back with — numbered from the cell rather than the document, which
is worse than no position because it still looks usable.

It now receives the header's offset and derives each cell's span from the same split,
shifting the reparsed contents onto the document.

Positionless nodes 68 → 52, and both table entries in the ceiling reach zero.
