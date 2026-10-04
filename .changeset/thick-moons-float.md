---
"@quartz-community/remark-obsidian": patch
---

End a table at a body row that drops the header's outer pipes.

GFM lets every row choose independently, so `| a | b |` over `| --- | --- |`
keeps reading `c | d` as a row. Obsidian ends the table there and reads the rest
as prose, which is visible rather than structural — the pipe shows up in the
text, and a formatter rewriting the "table" would mangle a line Obsidian never
treated as one.

Worth recording for anyone extending this: unlike emphasis, highlight and link
reference definitions, **there is no tokenizer to port here**. Measured against
the legacy stack directly, `remark-parse@8` makes `c | d` a row exactly as GFM
does, and renders `| a | b |` over `| --- |` as two cells where Obsidian renders
one. Obsidian's table handling is its own, so these rules are derived from
recorded output rather than from a port.

Two corpus cases.
