---
"@quartz-community/remark-obsidian": patch
---

A setext underline needs a single content line to make a heading.

Obsidian parts company with CommonMark here, and the spec's own examples are
the evidence: 81 (`Foo *bar` / `baz*` / `====`) and 82 are multi-line setext
headings per CommonMark, and Obsidian reports no heading for either — the
whole thing is one paragraph. `remark-parse@8` only makes a heading from a
single content line.

The demoting pass already handled a sloppy underline, an indent or trailing
whitespace cancelling the heading. It now also demotes when more than one
content line sits above the underline, which covers 17 cases including the
two spec examples.
