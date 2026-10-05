---
"@quartz-community/remark-obsidian": patch
---

Harvest 244 minimal cases from a 500-seed fuzz sweep.

The sweep found 270 disagreements, shrank each to the smallest document that
still disagrees, and grouped by that reduced form. The result is 244 distinct
causes averaging a couple of dozen characters — small enough to read, and now
permanent corpus cases rather than seeds someone has to re-derive.

38 of them already matched by the time they were recorded, because fixes
landed while the sweep ran. 206 are genuine divergences, led by embeds (65),
highlights (41) and footnotes (26). The corpus grows to 2455 and the headline
rate falls to 86.7%, which is the honest figure: these are 206 real
divergences that were previously unmeasured, not a regression.

The repeated forms are worth naming. `| a \n| --- \n` turned up from eight
independent seeds — a table whose cells carry a trailing space — and `^blk`
from six. Both were already known, which is a reasonable check that the
pipeline finds real things rather than noise.

Two gates fired on the new cases and both findings are recorded rather than
waved through: one text node spans `- [` while holding `[ ]`, a heading built
at a list marker's offset instead of the task content's, and five footnote
labels are claimed by another construct before the footnote pass sees them.
Each is enumerated so a sixth cannot arrive unnoticed.
