---
"@quartz-community/remark-obsidian": patch
---

Add seeded differential fuzzing against real Obsidian.

The corpus can only contain what someone thought to ask, and the generated
layers cross each construct against each context and adjacency — exhaustive
two-way coverage that is blind to anything needing three constructs to
interact. Exhausting the input space is not possible, so this takes the other
approach: compose known fragments at random depth and order, sweep a seed
range against Obsidian, and report which seeds disagree.

Generation is deterministic from a 32-bit seed, which is the point. A failure
is a number, not a snapshot: `generate(n)` reproduces the document on any
machine, and promoting it into the permanent corpus is a copy and paste.

Random bytes would be useless against a Markdown parser — they essentially
never land on a delimiter boundary — so the generator works from real
delimiter pairs, real containers and eight ways of breaking a pair.

A nightly workflow sweeps a fresh random seed base, fails loudly, uploads the
recording and opens an issue naming the seeds. The first 200-seed sweep found
95 disagreements, concentrated on setext underlines at 2.1x the rate they
appear in passing documents.
