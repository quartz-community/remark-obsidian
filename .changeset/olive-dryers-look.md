---
"@quartz-community/remark-obsidian": patch
---

Keep every header cell when a delimiter row runs short.

The transform that builds a table from `| a | b |` over `| --- |` truncated it
to the delimiter's width, producing one column. That matched the golden, and
the golden was wrong: a full-corpus sweep against a real Reading View shows
Obsidian renders **two** cells. The delimiter supplies alignment; running
short does not drop a column.

The detached renderer the recorder uses drops a row's surplus cells, a
rendering difference the harness already documents for two other over-long
rows. Matching it here would have cost a cell outright — a formatter reading
our tree would rewrite `| a | b |` as a one-column table and lose `b`, which
is the kind of silent loss this package exists to prevent.

`hunt/table-delimiter-cell-count/0` is therefore re-triaged from `match` to
`replicate`, with a note on the golden recording why it cannot be matched. It
is a case where the measurement is wrong rather than the parser.
