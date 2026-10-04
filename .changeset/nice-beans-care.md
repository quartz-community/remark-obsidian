---
"@quartz-community/remark-obsidian": patch
---

Split a footnote definition inside a quote, not just at the document level.

A definition's lazy continuation swallows a table or a setext-underlined
heading that follows it, and the pass that undid this only walked the
document's own children. Inside a quote the same shape went unsplit, so
`> [^1]: body` / `> a | b` / `> --- | ---` reported one definition where
Obsidian reports a definition and a table.

The obstacle was positions rather than detection. A slice taken inside a quote
carries `> ` on every continuation line, so it cannot be matched against block
patterns or re-parsed as-is — and removing the prefixes shortens the text by a
different amount on each line, which makes the usual shift-by-a-constant wrong
the moment a block spans more than one.

`src/lib/line-map.ts` keeps the de-prefixed text alongside the absolute offset
and line number each line really started at, so a fragment parsed from it can
be placed back exactly. The split now runs on that map and both halves are
restored through it. Two corpus cases, and the mapper is reusable by any other
pass that needs to re-parse a slice out of a container.
