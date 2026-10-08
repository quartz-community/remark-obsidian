---
"@quartz-community/remark-obsidian": patch
---

`_` closes inside a non-ASCII word, because legacy's word test is ASCII-only.

`_пристаням_стремятся` renders `<em>пристаням</em>стремятся` in Obsidian where `_foo_bar`
stays literal. `remark-parse@8` delegates the word check to `is-word-character`, which is
`/\w/` and nothing more, so no non-ASCII script counts. The port had `\u0080-\uFFFF` added
to the class, which inverted the rule for every such script.
