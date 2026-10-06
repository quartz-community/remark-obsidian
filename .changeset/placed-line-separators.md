---
"@quartz-community/remark-obsidian": patch
---

Place the line separators that rebuilt paragraphs insert

Five passes that fold lines back into a paragraph pushed a bare
`{type: "text", value: "\n"}` for each line boundary, with no position —
`setextUnderlineTransform`, `multilineSetextTransform`, `footnoteLabelTransform`,
`tableInterruptTransform` and the definition tail in `commentTailTransform`. Two of
them also pushed the line's own text unplaced when it did not reparse to a paragraph.

`remark-breaks` then turned each unplaced separator into an unplaced `break`, so one
missing position became two. Each site already tracked the offset it was walking, so
the newline's span was available all along.

Positionless nodes drop from 168 to 68, after the 1188 to 168 that positioned soft
line endings. `paragraph > break` goes 67 to 7 and `paragraph > text` 17 to 10, with no
corpus case changed.
