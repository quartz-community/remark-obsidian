---
"@quartz-community/remark-obsidian": patch
---

Fixes a formatter loop that grew a file without bound on every pass.

A `%%` inside a footnote definition was folded back into its paragraph as one text node
holding the raw source, container indent included. The definition handler then indented
that value again, the doubled run's leading space was encoded as `&#x20;`, and its `&` was
escaped on the pass after -- four columns and a backslash run per round, forever. A
48-byte definition reached 12kB in eleven passes.

Now split per line with exact spans, so offsets stay correct: six of the thirteen
non-converging round-trip cases are fixed, with no parity change.
