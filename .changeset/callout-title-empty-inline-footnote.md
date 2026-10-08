---
"@quartz-community/remark-obsidian": patch
---

A callout title that is only an empty inline footnote is still a title.

`> [!note] ^[]` shows the footnote as its title. The same footnote with content, `^[x]`,
already worked — the gate read the title's collected _text_, and `^[]` collects to nothing,
so the callout fell back to displaying the capitalised type.
