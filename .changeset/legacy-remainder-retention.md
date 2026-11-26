---
"@quartz-community/remark-obsidian": patch
---

`legacy`: a parsed tree no longer keeps a copy of the rest of the note for every table, list or other block the reader rewinds over. remark-parse 8 rebuilt the remaining text after each rewind, and the text nodes read afterwards held on to those copies, so memory grew with the square of the note: 2,000 small tables with a paragraph each (242 KB) kept about 240 MiB alive, and now keep about 9. The tree is unchanged.
