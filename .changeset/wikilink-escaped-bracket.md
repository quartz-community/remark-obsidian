---
"@quartz-community/remark-obsidian": patch
---

A backslash no longer smuggles a doubled bracket into a wikilink target.

`[[\[[a|b]]]]` holds `[[` in its target, so it cancels exactly as `[[[[a|b]]]]` does and
Obsidian reports no link there. `pathEscape` consumed the bracket as content, which let the
backslash past the doubled-bracket check and produced a link to `[[a`.
