---
"@quartz-community/remark-obsidian": minor
---

Add the missing `callout` serializer, and gate serialisation.

Every construct this package adds shipped a `toMarkdown` handler except the
callout, because a callout is produced by a transform rather than a syntax
extension and the transform only ever needed the parsing half. The result was
that `mdast-util-to-markdown` threw `Cannot handle unknown node 'callout'` on
any tree holding one, so the package could not serialise the commonest
Obsidian block — the exact path a formatter such as `obsidian-linter` takes.

58 of the 1531 corpus cases threw on serialisation; none do now.

A new gate covers the half the parity corpus never did. Serialising must never
throw, and formatting must reach a fixed point: the first pass may normalise,
the second must change nothing. 1455 of 1531 cases settle; the 76 that do not
are pinned so the set cannot grow, and include two worth knowing about — a
wikilink alias pipe is not escaped inside a table cell, so a second pass splits
the row, and an escaped line break inside a highlight or emphasis gains a
backslash on every pass.
