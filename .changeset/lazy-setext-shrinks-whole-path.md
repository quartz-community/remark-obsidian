---
"@quartz-community/remark-obsidian": patch
---

Every container a lazy setext underline was found through now shrinks, not just the outermost
and innermost. `> - item` / `title` / `===` left `blockquote 0->8` holding a `list 2->18` --
a child outliving its parent -- because the helper locating the paragraph descended through
the list without the list being shrunk afterwards.
