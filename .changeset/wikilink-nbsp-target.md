---
"@quartz-community/remark-obsidian": patch
---

Resolve a no-break space in a wikilink target as an ordinary space.

`![[*\u00a0*]]` is an embed of the note `* *` in Obsidian. Applied to `path` and `heading`
only — the resolved target — so `value` and the source keep the character the author typed
and a formatter cannot rewrite it.
