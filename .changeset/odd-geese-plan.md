---
"@quartz-community/remark-obsidian": patch
---

Make a fuzz sweep report causes instead of seeds.

A sweep that names seeds hands over work rather than findings. Raw failures do
not group — a generated document carries six to eight constructs, so grouping
94 of them by diverging projection and construct gave 90 classes and 86
singletons, which is no grouping at all.

Shrinking first is what turns a flood into a backlog. Every failure is reduced
to the smallest document that still disagrees, and the reduced form is the
dedup key: two seeds that shrink to the same text are the same bug however
differently they started. Candidates for every failure are pooled into one
recording per round, so shrinking twenty documents costs about what shrinking
one did.

On a 40-seed trial, 20 failures reduced from an average of 200 characters to
24 — `"^blk\n"` at five characters, and `"| a \n| --- \n"` found independently
from two seeds, which is the trailing-space table bug already known by hand.

Two honest notes. Round caps matter: a four-round cap was still shrinking 16
of 20 documents when it ran out, and unreduced leftovers are exactly what
fails to deduplicate; it now runs to convergence. And the dedup factor is only
about 1.05x even so, because the divergence surface is genuinely wide rather
than a few causes repeated — so the value here is the minimal cases, not the
grouping.
