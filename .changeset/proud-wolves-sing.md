---
"@quartz-community/remark-obsidian": major
---

Stop corrupting documents on a second formatting pass.

Two serialisation defects, both of which damaged ordinary content rather than
edge cases, and neither visible to any parity projection.

**An aliased wikilink inside a table cell split the row.** The wikilink
handler builds its own string instead of going through `state.safe`, so
nothing escaped the alias separator — `| [[Note\|Alias]] |` was written with a
bare pipe, read back as two cells, and the second pass rewrote the table. The
pipe is now escaped inside a cell.

**A line break grew a backslash on every pass.** A break was written as a
trailing backslash, which in a chain with `remark-breaks` — the chain this
package is built for, and the one Quartz pins — asserts a hard break the
source never had. Every multi-line paragraph gained a backslash the first time
it was formatted, and inside the legacy highlight and emphasis scans it never
settled at all: those read raw codes rather than CommonMark escapes, so
`==text\==` keeps `text\` as content, and the backslash compounded without
bound. A break is now written as a newline.

New `escapedLineBreaks` option restores the old spelling for a consumer whose
chain has no `remark-breaks`, where a break really is a hard break.

Inputs that formatting cannot settle fall from 97 to 24. Obsidian parity is
unchanged at 2070 of 2211.
