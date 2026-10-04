---
"@quartz-community/remark-obsidian": patch
---

Import the CommonMark spec's 652 examples into the parity corpus.

The rest of the corpus was written alongside the parser, which makes it
circular as evidence: it can only contain what someone thought to ask. The
spec is the opposite — an externally authored, enumerable description of the
base grammar, which is most of what a note actually contains.

Their expected HTML is discarded. CommonMark is not the oracle here, Obsidian
is, and it diverges on purpose in places this package documents. What the spec
supplies is coverage of the input space, not the answer; every case is
recorded against Obsidian like any other.

575 of 651 match and 76 diverge, none of the previous 1531 regressed. Links
account for 25 of the divergences, then HTML blocks, setext headings and list
items. Code coverage of `src` is 96.6% of lines and 90% of branches, which is
exactly the point: coverage was already high while the base grammar had 76
unmeasured divergences, because coverage cannot see behaviour never written.

The lossiness gate fired once and was wrong: it resolved escapes on both the
source and the node value, and a value legitimately holding a backslash then a
bracket looked like a dropped character.
