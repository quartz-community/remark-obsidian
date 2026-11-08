---
"@quartz-community/remark-obsidian": patch
---

`strict` no longer takes quadratic time on a long run of `$` openers that close nothing, such as
`$a $b $c …`, where a `$` after a space cannot close: once a `$` opener finds no closer, later `$`
openers in the same paragraph skip the search, as `legacy` already does. The trees are unchanged.
