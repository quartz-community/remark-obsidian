---
"@quartz-community/remark-obsidian": patch
---

Let an unclosed fence inside a list item keep consuming, as Obsidian's parser does.

CommonMark closes an unterminated fenced code block at the end of its container,
so `- ```` ``` ````, ` code`, `plain`ends the list item and starts a paragraph.
Obsidian leaves the fence open and swallows the lazy line as code. That matters
beyond block shape: code is literal, so a`[^1]` inside it stays written instead of
being read as a footnote reference and reduced to a bare name.

Only a sibling starting at column 1 is absorbed. An indented child belongs to the
list item on either reading, and taking it would corrupt ordinary nested content;
a lazy continuation is unindented by definition. Four corpus cases.
