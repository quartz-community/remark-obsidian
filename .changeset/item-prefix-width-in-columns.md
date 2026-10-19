---
"@quartz-community/remark-obsidian": patch
---

A list item's prefix width is now measured in columns, so a tab in it no longer counts as one.

`2)` tab four-spaces `More` over seven-spaces `[^1]: def` is a definition at column 4 in
Obsidian. The item's prefix width decides how much indentation the item's own content keeps, and
it was computed by character count — a tab counting one — so the prefix came out three columns
wide instead of four. The label line then kept four spaces, exactly the indented-code threshold,
and the code block swallowed the definition.

The character count came from trusting `sliceSerialize(token, true)` to expand tabs. It does
not: it replaces a tab with a **single space**, so `"2)"` tab serialises to `"2) "` either way.
Counting columns from the raw slice is what gives four.

This affects any item whose marker separator or leading indentation contains a tab, and it is
the quantity three earlier attempts in this area were reaching for by other means.
