---
"@quartz-community/remark-obsidian": minor
---

Add the `keepUndefinedReferences` option, off by default and `legacy` only. A link or image
reference this parse found no definition for stays a `linkReference` or `imageReference` with
`data: { defined: false }`, where it was text: `[a] b` holds a reference to `a`. It is for a
consumer parsing part of a note or a table cell alone, where the definition may be somewhere this
parse never saw. A full reference nothing defines gets the same flag. A chain that renders should
leave it off, since `mdast-util-to-hast` reads these differently from text.
