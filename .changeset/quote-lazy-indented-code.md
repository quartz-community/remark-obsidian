---
"@quartz-community/remark-obsidian": patch
---

A lazy line indented four columns under a root blockquote is now root indented code.

`> quote` followed by an unquoted line at four or more columns is a blockquote and a separate
code block in Obsidian, not one blockquote swallowing the line. We continued the quote, so a
footnote definition or reference standing on that line was indexed when Obsidian indexes
nothing there, and the code block it should have produced was missing from the document's
block structure entirely.

The predicate is four spaces or a leading tab. Eighteen follower indents were asked of the
running application: nothing is code below four columns, everything from four upward is, and
one to three spaces followed by a tab is not — the same asymmetry `definition-indented-code.ts`
already carries, derived here independently from a different oracle.

It applies to a quote starting at column 0 only. A quote nested in a list item or a definition
produces no root code at any indent from zero to twelve, because its lazy line belongs to the
container above it.

Content after the code block is re-parsed rather than dropped. `> quote` / `> - item` /
four spaces `lazy` / `> after` is a blockquote, a code block and a second blockquote in
Obsidian — the marked line resumes a quote — so the lines the rule cuts away are rebuilt in
place instead of being deleted with the rest.

Found by a new composition axis that generates partially prefixed container bodies, which is a
shape no existing sweep could express — the others prefix every line of the nested block.
