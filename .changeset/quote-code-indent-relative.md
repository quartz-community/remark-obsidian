---
"@quartz-community/remark-obsidian": patch
---

Measure a quote's indented-code threshold from its container, not column zero.

A footnote definition continues at four spaces, so inside one those four are the
continuation and code needs eight. `[^1]: > [!note` over `    [[target]]` is the quote's
lazy continuation, and cutting it into a code block lost the wikilink Obsidian indexes.
