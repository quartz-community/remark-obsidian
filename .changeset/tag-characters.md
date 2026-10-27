---
"@quartz-community/remark-obsidian": patch
---

Read a tag's characters as Obsidian does, under both presets.

A tag now runs through anything but whitespace, ASCII punctuation other than `/`, `_` and `-`,
and the General and Supplemental Punctuation blocks (U+2000-U+206F, U+2E00-U+2E7F). So `§`,
currency signs, arrows, maths symbols and CJK and full-width punctuation continue a tag --
`#§section`, `#a€b` and `#a「b」` are each one tag -- while `’`, `…` and `—` end one. Tags
had been limited to letters, marks, emoji and digits, which missed 66 of 163 characters asked
of Obsidian. Tags that begin with an emoji outside the BMP (`#📚/status/finished`) tokenize, as
they already did since 2.0.0.
