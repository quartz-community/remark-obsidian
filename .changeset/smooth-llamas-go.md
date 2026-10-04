---
"@quartz-community/remark-obsidian": patch
---

Open a display-math block on a `$$` that ends a line inside a container.

At the document level a trailing `$$` does not open a block — `tail $$` / `x` /
`$$` is prose followed by an empty formula, which we already matched. One level
in, the same three lines are `tail ` followed by a block holding `x`.

The rule was measured, not inferred. Two recorded cases disagreed about
mid-line `$$` and no reading of them separated "mid-line" from "inside a quote"
from "inside a definition", so the corpus now probes each axis alone.
`math/midline-plain` against `math/midline-quote` and `math/midline-list` is
what isolates the container as the deciding factor; without those three the
rule could not have been written down.

micromark already leaves the shape to work from: the trailing `$$` becomes an
empty `math` sibling while the opener stays as text in the paragraph, so moving
the split point is enough and nothing is re-tokenized.

Three corpus cases, including `math/list-boundary`, which had been outstanding
since the first recording.
