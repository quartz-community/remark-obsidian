---
"@quartz-community/remark-obsidian": patch
---

A backslash hard break works inside emphasis, a highlight and strikethrough.

`*foo\` over `bar*` renders `foo bar`; the backslash survived as content. The legacy body
planner must emit each line ending as its own token, so the subtokenizer never saw the `\`
and the newline together. `*foo\\` over `bar*` still keeps its literal backslash.
