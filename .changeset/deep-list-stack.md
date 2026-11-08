---
"@quartz-community/remark-obsidian": patch
---

A deeply nested list or callout under `legacy` no longer throws `RangeError: Maximum call stack
size exceeded` from the step that reshapes remark-parse 8's tree. That step now walks on an
explicit stack, so the limit is the reader's own recursion. Trees are unchanged.
