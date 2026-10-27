---
"@quartz-community/remark-obsidian": patch
---

Render the formula of a `$$` block opened at the end of a line inside a quote or list item under
`strict`.

`1. Hello $$` / `   Math` / `   $$` held `Math` in the tree but rendered an empty
`<pre><code class="language-math math-display">`: HTML renders from the `data.hChildren` that
`mdast-util-math` builds at parse time, and the pass that filled in the formula left that hint
empty. Two more passes had the same omission -- `$$` / `Math$$` rendered `Math$$`, and a formula
holding a `:` or `.` next to a footnote label could render without it -- 86 documents of the
test corpora in all, none under `legacy`. A list item's indentation is also no longer kept in
the formula (`   Math` is now `Math`).
