---
"@quartz-community/remark-obsidian": patch
---

Rebuild an `<!--` region whose opener a container swallowed, and stop the region
rewrite duplicating trailing blocks.

The `%%` pre-scan landed first, and extending it to HTML comments looked like it
should transfer. It does not: `%%` is Obsidian's own construct paired lexically,
while `<!--` is a CommonMark HTML block that answers to structure `%%` ignores.
Pairing it the same way broke three cases that already matched, each naming a
rule:

- it does not pair across a blank line, so `x <!--` / blank / `hidden` / blank /
  `--> after` is not a comment;
- an opener inside a link or footnote label is literal, so neither
  `see[^a<!--x-->b].` nor `body [^c<!--d] … ⏎--> end` is one either.

The signature also had to change. A swallowed `%%` leaves a comment node
touching the region; a swallowed `<!--` leaves an `html` node covering only the
four-character opener, so "a node starts here" means nothing and what counts is
whether one _covers_ the region.

Fixing that exposed a latent bug in the `%%` rewrite shipped alongside it. The
splice removed only the blocks overlapping the region while `after` re-parses
the entire remainder, so a trailing block outside the region was emitted twice.
No `%%` case hit it because their regions happened to reach the last block; the
first HTML case produced `tail tail`. The splice now replaces everything from
the host onward.

Two corpus cases, closing the `definition-block-owns-region-opener` family.
