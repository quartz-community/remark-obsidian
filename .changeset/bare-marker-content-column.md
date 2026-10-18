---
"@quartz-community/remark-obsidian": patch
---

A footnote definition under an empty list item now starts at the marker's own width, not one
column further.

CommonMark gives an empty item a content column of `W + 1` where `W` is the marker's width.
Obsidian gives `W`: under a bare `-` a definition indented one space reports column 1, and under
a bare `10.` an indented definition reports column 3. The `+1` belongs to a separator that is
actually present, so `- ` really is 2 and `10. ` really is 4.

The content-column helper required at least one space after the marker, so an empty item never
matched it and the column fell through to an unrelated fallback.

Eleven probes recorded against the running application move to agreement, with the referee
figure, the code-range dimension and the corpus all unchanged.
