---
"@quartz-community/remark-obsidian": patch
---

A table indented into a footnote definition is no longer folded back into its text.

Rule C4 of Obsidian's reading rules is "a table interrupts a definition but not a paragraph",
and in mdast a definition's text IS a paragraph — so the pass that implements the paragraph half
could not tell the two apart and buried the table in both. Burying it takes the references in
its rows with it: `[^1]: body` over an indented `| c[^2] | d |` lost `[^2]` entirely.

The indent is the boundary. A table at column 0 under a definition line is the separate question
of whether the definition ENDS there, and excluding that too costs a document.

    referee 6237 -> 6238
