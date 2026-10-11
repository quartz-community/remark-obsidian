---
"@quartz-community/remark-obsidian": patch
---

A footnote name may not hold ASCII whitespace.

`a[^x [y] b` is no reference in Obsidian, where it had been claimed as one named `x [y`.
A name carrying U+00A0 or U+3000 is still accepted.
