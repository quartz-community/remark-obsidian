---
"@quartz-community/remark-obsidian": patch
---

An empty link label no longer takes a footnote reference as its reference.

`[text][][^1]` has three brackets. The `[]` is the collapsed marker of `[text]`, so `[^1]` stands
alone and Obsidian indexes it as a footnote reference. We read the `[]` as a label in its own
right and took `[^1]` as its reference, producing one `linkReference` over both and losing the
footnote entirely.

The test is on the characters, not the tree: at this point `[^1]` is still text, and the node that
would answer a tree query is created by a later pass which only runs because these characters were
left alone.

Scoped to an _empty_ label, which is what separates the two readings:

```
see [text][][^1]     ref `1` — `[]` is a collapsed marker, `[^1]` is free
a [text][^9] b       no footnote — a non-empty label does take `[^9]` as its reference,
                     forming a link to an undefined label that renders as literal text
```

Differential harness: 6131 → 6133 of 6818 documents with no regressions, references 98.10% →
98.12%.
