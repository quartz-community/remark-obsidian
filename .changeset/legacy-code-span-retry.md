---
"@quartz-community/remark-obsidian": minor
---

Let an inline-code opener retry with a shorter width

CommonMark requires a closer of exactly the opener's width and leaves the whole run
literal without one. Obsidian instead sheds backticks from the left until the opener
matches a closer that does occur ahead, so ` `code` `` is a literal backtick followed
by a code span holding `code`, and ``` ```code` ``` is two literal backticks and the same
span. A short opener never grows — `` `code`` `` stays literal either way.

Context turned out to be irrelevant: emphasis, strong, heading, blockquote, list item,
table cell and link label all behave exactly as the bare case.

New `legacyCodeSpans` option, on by default. It also makes a pathological document
dramatically **faster**. cmark's increasing-run shape makes every opener scan to the end
of the context and fail, which is superlinear in stock micromark — 2.1s at 125KB, 132s at
2MB. Those openers are precisely the ones this rule decides, so they are now settled from
a run index built once per text context and stock never runs the failing scan: 620ms
against 130s at 2MB, 210x faster, and linear in bytes where stock is not.
