---
"@quartz-community/remark-obsidian": patch
---

Stop a display-math opener at two markers, closing the last reported divergence.

Obsidian's display delimiter is exactly `$$`, and it pairs with the very next
`$$`. An over-long run therefore opens an empty span and leaves the rest as
text: `$$$$x^2$$` is empty math followed by a literal `x^2$$`, and
`$$$$x^2$$$$` is two empty spans around a literal `x^2`. We consumed the whole
run as one opener, which made it four markers wide so nothing could close it.

These were the last two cases triaged `report-upstream`, and the change was
held back earlier as too risky to attempt. It was not: `goldens/math-content.json`
is a second oracle recorded against 1.14.2 holding 78 math cases with their
exact `tex` bodies, built for precisely this kind of change. Both oracles
confirm it — 1122-case corpus unchanged except for the two, and all 78 math
cases still pass.

The two entries were pinned there as `divergent`, and the oracle's two-way
policy caught them the moment they started matching; both are re-triaged. With
these closed, `report-upstream` is empty: every divergence this package records
against Obsidian is now one it reproduces.
