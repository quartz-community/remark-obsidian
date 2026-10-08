---
"@quartz-community/remark-obsidian": patch
---

The parity harness now strips html tags with a scanner rather than a regex.

A `>` inside a quoted attribute value does not close a tag, so a two-line `<a>` renders
no text; a regex stopping at the first `>` leaked the attribute tail. The quote rule holds
for tags only -- `<!` and `<?` are bogus comments that end at the first `>` whatever
quotes enclose it, which `<?php` / `echo '>';` / `?>` is the case that proves.
