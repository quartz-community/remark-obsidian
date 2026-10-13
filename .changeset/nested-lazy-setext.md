---
"@quartz-community/remark-obsidian": patch
---

Hand a nested quote's last lazy line to a setext underline, as a single-level quote already
did. `> > quote` / `title` / `===` reports a root heading in Obsidian at any depth; the pass
looked for the trailing paragraph only among the outer quote's own children, found the inner
quote there, and declined. The quote-marker strip now removes a run rather than one marker.
