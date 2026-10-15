---
"@quartz-community/remark-obsidian": patch
---

A footnote definition absorbed into another footnote definition takes its host's content column
of four rather than being reported at column zero. `[^a]: def` over a blank line and an indented
`[^b]: body` now reports `[^b]` at its bracket where the indent is under four, and at four
beyond that, matching Obsidian; it had been reported at zero regardless.
