---
"@quartz-community/remark-obsidian": patch
---

Make a run of inline-footnote openers linear instead of quadratic.

Every `^[` scanned forward for a balanced `]`, so a run of openers with no
`]` anywhere cost one full scan each: `^[` repeated twenty thousand times
took 21 seconds where the bare chain took 160ms. A 40KB note anyone can type
wedged the parser.

The document now remembers the point past which no `]` remains, and openers
after it fail immediately. **20000 openers: 21s → 148ms**, and the curve is
linear.

The recorded fact is deliberately "no `]` remains from here" rather than "this
attempt failed". The weaker condition would be unsound for a scanner that
counts bracket depth: `^[^[ ]` exhausts the input from the first caret,
because the inner `[` raises a depth one `]` cannot clear, yet a scan from the
second caret has a closer available — so a failure says nothing about later
positions, while the absence of any `]` does.

Behaviour is unchanged: identical output before and after, parity holds at
2070 of 2211, and no pinned case drifted.

`highlight-run` remains quadratic and is a different problem. A run of `=` is
full of `==` pairs, so every attempt _finds_ a closer and the cost is the
chunk scan reading to end of input before it can judge itself — that needs the
scan to stop at the decision point, which is a restructure of the legacy port
rather than a memo.
