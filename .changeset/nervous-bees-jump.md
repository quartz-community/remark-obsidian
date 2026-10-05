---
"@quartz-community/remark-obsidian": patch
---

Harvest a second sweep, and fix the id collision it exposed.

176 more minimal cases from 400 fresh seeds: 213 disagreements reduced to 188
distinct causes, of which 30 already matched thanks to fixes that landed while
the sweep ran.

The harvest had a real bug, and the way it hid is the interesting part. It
numbered cases from one on every run, so a second sweep collided with the
first — and `buildCorpus` deduplicates by markdown, so the case count looked
correct while the recorder, which keys its output by id, silently overwrote
174 cases and took their triage with them. Only the recorder's own
"captured N of M" check noticed. Harvest now continues each category's
numbering, and a test asserts corpus ids are unique so the next one cannot
hide.

The Reading View cross-check also no longer aborts on a document it cannot
open. `u)[[$[^]$]]` never mounts a leaf, which is a property of the viewer
rather than the parse, and failing the whole sweep over it threw away the
cross-check for every other case. Such cases are now reported and skipped.
