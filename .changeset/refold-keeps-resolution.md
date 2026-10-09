---
"@quartz-community/remark-obsidian": patch
---

The inline refold no longer undoes the tokenizer's escape resolution.

Refolding re-parses a paragraph against a copy whose newlines are spaces, then puts the
real characters back. It did that by overwriting each text node's value with the raw
source slice, which restores the line endings and discards everything else the tokenizer
decided: `\*\* ` resolved to `** ` and was respelled with its backslashes, so every format
pass escaped them again and the run doubled without bound.

Now the raw slice and the value are walked together, so only a substituted line ending is
taken back. Three more round-trip documents reach a fixed point, with no parity change.
