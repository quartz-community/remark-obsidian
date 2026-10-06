---
"@quartz-community/remark-obsidian": patch
---

Keep a lone `]` inside a wikilink target

Only a doubled bracket closes a wikilink, and Obsidian reads a single one as part of
the target: `[[[](u)]]` links to `[](u)`.

We consumed the first `]` as a closing marker and rejected when the second was
missing, which failed the whole wikilink — CommonMark's link construct then claimed
the inner `[](u)`, so a markdown link to `u` was reported where Obsidian reports a
wikilink. A `check` for `]]` now decides before the bracket is committed, because
the character after it is what settles the question.

Scoped to the target. A stray `]` in a heading or alias is left alone, since nothing
recorded says what Obsidian does there.

10 cases move from `replicate` to `match` with no regression.
