---
"@quartz-community/remark-obsidian": patch
---

Trim a wikilink's inner text as a whole

Obsidian trims the text between the brackets **once**, then splits it on `#` and `|`.
Trimming each part separately is not the same thing: `[[  Note  #^id  ]]` resolves to the
path `Note  ` there, where trimming the path on its own ate two spaces Obsidian keeps.

So the first part present loses only its leading whitespace and the last only its
trailing, while anything interior keeps both. A lone path is both first and last, so
`[[ page ]]` and `[[ ]]` are unaffected.
