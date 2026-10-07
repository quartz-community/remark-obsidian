---
"@quartz-community/remark-obsidian": patch
---

A defined label still resolves after a relabelled link.

`[foo][bar][baz]` with only `baz` defined is `[foo][bar]` as literal text and `[baz]` as a
shortcut reference reading `baz`. Taking `[foo][bar]` as the outer reference is what
`labelPrecedence` is for, but everything after it was pushed as one text node, so `[baz]`
was written out.
