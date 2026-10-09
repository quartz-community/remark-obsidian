---
"@quartz-community/remark-obsidian": patch
---

A block identifier behind an escaped bracket is found when a wrapper precedes it, so
`*x* \[^1` renders `x [`. The host walk gated on the whitespace-anchored pattern alone and
stepped past its own host into the emphasis.
