---
"@quartz-community/remark-obsidian": patch
---

An indented pipe row still belongs to a pipeless table.

C1 makes a table's header and delimiter rows agree on whether a row's first character is a pipe.
C2 extends that to the body: in a table whose header does not start with a pipe, a row does not
start with one either, so an indented `| c[^2] | d` is still a row. We read it as indented code,
and a reference inside code is never scanned — so the reference was lost along with the row.

Gated on `legacyTables`, because GFM does read that line as indented code.

    referee 6247 -> 6249
