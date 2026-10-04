---
"@quartz-community/remark-obsidian": patch
---

Keep an ordered list that cannot interrupt a paragraph inside the footnote
definition above it.

CommonMark only lets an ordered list interrupt a paragraph when it starts at
`1.`, so `[^1]: body` followed by `2. item text` is lazy continuation of the
definition rather than a list beside it. micromark applies that rule to ordinary
paragraphs but still closes a footnote definition at the marker.

The difference is visible rather than structural: a definition's body renders in
the footnote list at the end of the note, while a list beside it renders inline,
so the text appeared twice over. A list starting at `1.` still ends the
definition, because that one can interrupt. Two corpus cases.
