---
"@quartz-community/remark-obsidian": patch
---

One raw tab is a whole indent, in the legacy preset.

`remark-parse@8`, which Obsidian parses with, reads a leading tab as four columns outright.
micromark expands it to the next tab stop instead, so the same tab is worth fewer columns the
further into a line it starts. Behind a quote marker the shortfall is exactly one column: `>⇥Text`
yields three indentation codes where indented code needs four, so the content became a paragraph
rather than a code block — and a paragraph absorbs the following unquoted line, which silently ate
a column-0 footnote definition below it.

Three places had to agree about the tab for that to come right. `legacyBlockQuoteSyntax` now
spends only a space as the marker's padding, so the tab reaches the quote's content;
`legacyIndentedCodeSyntax` reads one raw tab plus the virtual spaces it generated as a whole
indent; and `legacyFootnoteDefinitionSyntax` accepts the same run as a definition's continuation,
so a tab line under a definition continues it instead of becoming code. Applying only the first
two traded 28 documents for 32 — the definition's container closed first and flow then claimed its
continuation line.

Measured against live Obsidian 1.15.0: `>⇥Text` is a code block, `>⇥⇥Text` keeps the second tab
verbatim where CommonMark would leave two spaces, and `>⇥<!--` is code rather than an HTML block.
The space rows are plain CommonMark and are unchanged, which is why this sits behind the legacy
preset. Differential harness: 6029 → 6066 of 6818 documents.
