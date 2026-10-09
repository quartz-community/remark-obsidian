---
"@quartz-community/remark-obsidian": patch
---

A block identifier followed by a `]` run is now registered.

`[[\[^1]` and `[\[^1]]]` register the block `1` in Obsidian. The identifier scan rejected
any candidate whose tail was not an emphasis marker, so a closer run never reached the
escaped-bracket gate written for exactly that shape.
