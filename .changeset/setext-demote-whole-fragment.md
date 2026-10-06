---
"@quartz-community/remark-obsidian": patch
---

Keep an inline construct spanning a demoted setext heading

Only one content line makes a setext heading in Obsidian, so a multi-line one is demoted
to a paragraph. That rebuild reparsed each line on its own, which gave every delimiter no
partner to pair with: `Foo *bar` / `baz*` / `====` reported no emphasis where Obsidian
reports `em:bar baz`. CommonMark's own examples 81 and 82 are exactly that shape.

The content lines are now reparsed as one fragment, with per-line offsets carried through
so a fragment inside a blockquote still lands correctly. The underline keeps its own
handling.
