---
"@quartz-community/remark-obsidian": minor
---

A `callout` now carries its marker's place under both presets: `data.marker` spans `[!type]` and
its fold character, and `data.lineEnd` is where that line ends. `> [!note]` has no `calloutTitle`
and `> [!note] [^1]: def` has a zero-width one, so a consumer had to read the source to find them.
Additive: the tree is otherwise unchanged, and rendering and formatting ignore the new fields.
