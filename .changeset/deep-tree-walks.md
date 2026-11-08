---
"@quartz-community/remark-obsidian": patch
---

Deeply nested trees no longer overflow this package's own tree walks. The writer's walks (over
a comment's parsed body, for instance, which the writer never descends into) and five of
`strict`'s passes now walk on an explicit stack, so a quote about 2,800 deep and a list about
1,400 deep no longer throw `RangeError: Maximum call stack size exceeded` under `strict`. Output
is unchanged. Formatting a deep list or quote is still limited by `mdast-util-to-markdown`'s own
recursion, at about 520 list levels and 1,300 quote levels.
