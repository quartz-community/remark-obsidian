---
"@quartz-community/remark-obsidian": patch
---

A quote does not absorb raw html at column zero; a list does.

`- x` over `</div>` is one list in Obsidian, while `> x` over `</div>` is a blockquote
**and** an html, exactly as `para` over `</div>` is. This rule was written from the list
and the paragraph and applied to a quote as well, because they share one container set.

`> x` over `<br>` is unaffected and still one blockquote.
