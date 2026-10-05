---
"@quartz-community/remark-obsidian": patch
---

Keep a footnote definition inside a task item

`- [ ] [^1]: def` lost its footnote entirely: `legacyDefinitionPromoteTransform`
read the task's paragraph as a link reference definition and produced a
`definition` named `^1`.

A `^` label is never a link reference definition. `remark-footnotes` registers its
block tokenizer ahead of `definition` in the stack Obsidian parses with, so it
claims `[^1]: def` first — the legacy stack reports a `footnoteDefinition` there.
The nested bracket that pass exists for, `[a[b]: /url`, is untouched.

Found by the lossiness gate, which reports a `[^label]` the source wrote but the
tree can no longer reach.
