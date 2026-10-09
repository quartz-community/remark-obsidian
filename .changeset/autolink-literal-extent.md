---
"@quartz-community/remark-obsidian": patch
---

A bare URL runs to whitespace, and nothing inside it parses.

GFM stops an autolink literal at `](` and lets the remainder tokenise, so
`https://e.test/p](`code`` grew a code span and `...]([[#tag]]` grew a wikilink. Obsidian
keeps everything to the next space in the link, so neither forms. Angle autolinks still
end at their `>`.
