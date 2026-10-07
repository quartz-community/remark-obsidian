---
"@quartz-community/remark-obsidian": patch
---

A checkbox with nothing after it on its line is not a task.

Obsidian wants the content on the same line: `- [ ]` followed by `===` is a list holding
the text `[ ]`, and `- [ ]` followed by `![[*` reads `[ ] ![[*`. Neither reports a task.
Micromark marks the item whenever content follows, and a lazy continuation counts, so the
`[ ]` vanished from the rendered text.

The checkbox goes back as text rather than being dropped, because it is still in the file.
