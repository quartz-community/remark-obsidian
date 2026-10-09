---
"@quartz-community/remark-obsidian": patch
---

An html block is serialised without its trailing line endings.

micromark gives an unclosed html block a span running through the line ending after it, so
the value ends in `\n` while the block separator writes one too. Written raw the two add
up, and an unclosed comment re-absorbs the surplus on the next parse, so an indented
`<!--` inside a footnote definition gained two line endings on every format pass forever.

Reproduced on bare `remark-parse` + `remark-gfm` + `remark-stringify` with none of this
package loaded, so the defect is upstream; this is a guard against it.
