---
"@quartz-community/remark-obsidian": patch
---

Reject a doubled bracket in a wikilink alias

A `[[` is no more legal in an alias than in a target. Accepting it made `![[a|[[b]]]]` an
embed of `a` aliased `[[b` — indexing a target Obsidian does not report and losing the one
it does, the inner link to `b`. Obsidian reads the outer markup as literal text around that
link.

Rejecting lets micromark retry one position along until the brackets are clean, which is
the same mechanism the target side already used.
