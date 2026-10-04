---
"@quartz-community/remark-obsidian": patch
---

End a footnote definition at a link reference definition.

A definition's lazy continuation already stops in front of a table or a
setext-underlined heading. A link reference definition is a block of its own
too, so `[^1]: body` over `[foo]: /url` over `more` is three blocks to Obsidian
where we reported one definition swallowing all of it — which hid `more` in the
footnote list instead of rendering it.

The check reuses the `remark-parse@8` port rather than a pattern: whether the
remaining lines are a definition is exactly the question that port already
answers, including the cases where its rules and CommonMark's disagree. One
corpus case.
