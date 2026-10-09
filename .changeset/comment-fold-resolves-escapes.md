---
"@quartz-community/remark-obsidian": patch
---

A `%%` comment folded back into a footnote definition resolves its escapes.

The fold took the comment's raw source as the text node's value, so `\[\[target]]` kept
its backslashes, `remark-stringify` escaped them again on the way out, and the run doubled
on every format pass. Resolving them is what a text node for that span would have held
anyway, so re-escaping is now idempotent -- and the output is byte-identical to bare
remark's for the same input.
