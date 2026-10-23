---
"@quartz-community/remark-obsidian": patch
---

Never produce a node whose start is after its end.

`definitionEndBeforeLabelTransform` pulls a definition's end back to before a trailing label, then
clamps every descendant whose end runs past the new reach. It did that without checking whether
the descendant's **start** was also past the reach — so a node at `[15..36]` became `[15..14]`,
which is impossible rather than merely wrong.

`legacy` promises exact positions because consumers index by them: `obsidian-linter` splices by
offset, so an inverted node corrupts an edit rather than misreporting one.

A descendant starting past the new reach now keeps its own span. It lies wholly outside the
definition's new extent, so its own span is the honest one — and that trades an _impossible_
position for a child-escaping-parent, which `invariants.test.ts` records as a ceiling rather than
asserting away.

<!-- prettier-ignore -->
```
structurally impossible positions   8 documents / 20 kinds  ->  1 / 2
  every `start AFTER end` violation gone                       31 of 33
  remaining: `end PAST source` on one document, a different class
legacy referee                      6208/6818, BYTE-IDENTICAL
```

Verified by `--ids` identity rather than an equal total: 0 gained, 0 lost.
