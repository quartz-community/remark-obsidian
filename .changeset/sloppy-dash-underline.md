---
"@quartz-community/remark-obsidian": patch
---

A sloppy dash underline is a thematic break, even over a single line.

`Foo` over `   ----      ` is a paragraph plus a thematic break: `remark-parse@8` accepts a
setext underline only with nothing around it, and a dash run it refuses still has its
thematic-break reading. `===` is unaffected, having no block form to fall back to.
