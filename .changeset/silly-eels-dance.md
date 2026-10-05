---
"@quartz-community/remark-obsidian": patch
---

Make a column-zero underline a heading inside a container, and index only
top-level headings.

Two rules the fuzz harvest surfaced together, each explaining dozens of cases.

At root, `para` over `===` has always been a setext heading. Inside a
container it was not: the underline sits outside the container's own prefix,
so it arrived as lazy continuation and the run became ordinary text — `- $x`
over `===` rendered as `$x ===` where Obsidian reports one list holding a
heading named `$x`, underline consumed. Fifty-odd reduced cases were all that
shape. It is limited to a two-line paragraph on purpose: a longer one does not
fold the same way, and `-  *em*` / `<br>` / `](u)` / `---` reports no heading
at all.

Fixing that exposed the second rule. Obsidian _renders_ a heading inside a
container but does not _index_ one: `> # Foo` paints a heading and records
none, while every heading its metadataCache does record sits at the top level,
indented or not. Four independent cases agree, so the metadata projection now
takes headings from the document's own children rather than from everywhere.

51 cases move to matching, with no regressions.
