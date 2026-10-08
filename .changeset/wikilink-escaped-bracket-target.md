---
"@quartz-community/remark-obsidian": patch
---

A backslash before `[` stays in a wikilink target.

`![[\[^1]]]` embeds `\[^1` in Obsidian, with the backslash in the path — `src` and `alt`
both show it. We unescaped it to `[^1` and resolved the wrong target. Completes the rule
the tokenizer already follows: inside a wikilink a backslash is never an escape.
