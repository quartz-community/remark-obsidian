---
"@quartz-community/remark-obsidian": patch
---

Widen the parity corpus from 1141 to 1469 cases, and record what it finds.

The corpus could only ever be as good as its blind spots, and it had some. Two
sweeps went looking: an edge-case hunt across Obsidian's own constructs, and a
survey of the test suites of other Obsidian-Markdown implementations
(obsidian-help, goldmark-obsidian, obsidian-export, mdformat-obsidian,
lezer-markdown-obsidian, remark-callout, quartz).

Four token axes join the generator — strikethrough, the two wikilink forms
carrying a second field, and the bare footnote reference — along with five
container contexts whose own syntax collides with an inline token. 158 seed
cases cover surface the generated layers cannot reach.

Of the 328 new cases, 268 already match and 60 diverge. None of the 1141
earlier cases regressed, so the new surface is genuinely new rather than a
re-measurement. The 60 are recorded as `replicate` with their divergence
pinned, the largest groups being block references (13, a construct no case
covered at all), callout marker syntax (12) and embed targets (7).
