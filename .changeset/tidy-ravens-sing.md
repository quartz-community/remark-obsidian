---
"@quartz-community/remark-obsidian": patch
---

Project an embed's whole target, a humanised callout type, and a heading's
block identifier.

Three display rules the comparison had wrong, all measured against recorded
Obsidian:

- An unresolved embed shows its target as written, fragment included.
  `![[Document.pdf#page=3]]` reads `Document.pdf#page=3`, where a plain link
  reads only its path — we dropped the fragment for both.
- A callout with no title shows its type _humanised_, not merely capitalised:
  `[!NOTE]` reads "Note" and `[!project-status]` reads "Project status", so
  the rest is lowercased and hyphens become spaces.
- A heading carries a block identifier as readily as a paragraph, and
  `## Heading ^id` is rendered without it.

Ten cases move to matching, with no regressions.
