---
"@quartz-community/remark-obsidian": patch
---

An entirely empty wikilink keeps its space when serialised.

`[[ ]]` was written back as `[[]]`, which does not parse as a wikilink at all, so a second
formatting pass read plain text and escaped it to `\[\[]]` — growing again on every run.
Five corpus documents never converged on this.
