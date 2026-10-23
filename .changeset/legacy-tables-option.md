---
"@quartz-community/remark-obsidian": minor
---

Add `legacyTables`, and gate the strict preset against the GFM spec's extension examples.

The CommonMark differential was structurally blind to GFM extensions. GFM is "a strict superset of
CommonMark" (spec §1.1), so tables, task list items, strikethrough, extended autolinks and
disallowed raw HTML appear in **no** CommonMark example — meaning "this pass owns no spec example"
meant "the spec has no coverage there", which is not the same claim as "this agrees". Obsidian's
own documentation cites this spec for its GFM support.

`test/parity/gfm.ts` adds the 24 tagged extension examples from `cmark-gfm`'s `test/spec.txt`, and
they found three divergences on arrival — all tables, all structural:

<!-- prettier-ignore -->
```
gfm/table/199   stock: table/tableRow/tableCell    ours: paragraph + break nodes
gfm/table/202   stock: 3 tableRows                 ours: 2 rows + paragraph
gfm/table/203   short delimiter row mishandled
```

`199` is a delimiter row without leading or trailing pipes; `202` drops a trailing pipeless row
that GFM absorbs into the table. Both would render wrongly in Quartz today.

`legacyTables` gates all six table passes. Only `tableShortDelimiterTransform` owns an example
alone — `199` and `202` need the group, which is why the guard covers all six rather than the one.

    strict gate corpus   652 -> 676 examples (CommonMark + GFM extensions)
    GFM extension divergences   3 -> 0
    legacy referee              6208/6818, BYTE-IDENTICAL

The other two GFM-extension passes are now **verified rather than merely uncovered**:
`autolinkLiteralExtentTransform` and `bareCheckboxTransform` agree across all 16 autolink,
strikethrough and task-list examples, so no option is warranted for them.
