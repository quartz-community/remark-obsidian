---
"@quartz-community/remark-obsidian": patch
---

Require a table's header and delimiter to agree on the leading pipe.

GFM does not care, and builds a table from `| a |` over ` | --- |`. Obsidian
requires the rows to be written the same way and decides that on the row's
very first character, so one leading space means "no pipe": both
` | a |` / `| --- |` and `| a |` / ` | --- |` are ordinary paragraphs.

Two details are measured rather than assumed. The check reads the header from
the start of its line, because remark begins a table after up to three
leading spaces and slicing at the node's own offset discards the character
the rule is about. And it applies at root only: inside a container every line
but the first carries a `> ` or an indent, which is indistinguishable here
from the leading space that means "no pipe", and treating them alike demoted
callout tables Obsidian builds.

Also completes the `%%` opener rule in the flow tokenizer, so `%% 50%` and
`%%%` are paragraphs there too. Four cases from the author's list move to
matching.
