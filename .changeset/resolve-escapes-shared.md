---
"@quartz-community/remark-obsidian": patch
---

A failed definition line keeps its escapes resolved.

`legacyDefinitionTransform` places the line it cannot read as a definition verbatim, so
`[foo]: /url\bar\*baz "foo\"bar\baz"` rendered with its backslashes where Obsidian shows
`\*` as `*` and `\"` as `"`. The escape set is backslash plus ASCII punctuation --
confirmed against the arbiter, where `\b` stays and nine punctuation escapes resolve --
and the resolver is now shared with the comment fold rather than duplicated.
