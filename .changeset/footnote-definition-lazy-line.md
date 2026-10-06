---
"@quartz-community/remark-obsidian": patch
---

Take the line below a footnote definition into it

A definition whose first line carries content already absorbs what follows by ordinary
lazy continuation, so `[^1]: one` / `b` was always one definition. But lazy continuation
needs an open paragraph, and there is none when the first line is empty or is a bare
container opener — `[^1]: `, `[^1]: >`, `[^1]: -`, `[^1]: > >` — so the definition ended
and the next line was left behind as a sibling paragraph, leaking content Obsidian
renders nowhere.

A blank line still ends a definition, and only a paragraph is absorbed: an interrupting
block genuinely ends one.
