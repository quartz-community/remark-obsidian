---
"@quartz-community/remark-obsidian": patch
---

Two rules settled by probing Obsidian directly.

Frontmatter is reported whenever every quoted scalar shows its quote character twice,
escaping ignored — not when a strict YAML parser accepts it, which is what `x: '1''`
disproves. And a same-line list child nests only when its parent is a task, so
`- [x] 1.` reports a nested item where `*\t*` reports two root ones.
