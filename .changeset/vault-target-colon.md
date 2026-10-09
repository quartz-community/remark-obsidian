---
"@quartz-community/remark-obsidian": patch
---

The parity harness now treats a colon anywhere in a destination as external, not just a
leading scheme. `[link](foo\)\:)` is a link to `foo):` in both trees, and Obsidian renders
it `class="external-link"`, so the recorder reports no vault link where we reported one.
The three copies of that test are now one predicate.
