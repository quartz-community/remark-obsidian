---
"@quartz-community/remark-obsidian": patch
---

Drop block identifiers before comparing projections.

`^block-id` is an anchor, not content. Obsidian renders neither the trailing
form `A paragraph. ^id` nor the standalone one, where a `^id` on its own line
names the block above it and produces no block of its own — our projections
reported both as text, which made thirteen block-reference cases diverge on
nothing but the anchor.

The tree keeps the identifier, the same split used for an undefined footnote
reference and a surplus table cell: the source said `^id`, so removing it from
the tree would let a formatter delete an anchor other notes link to.
`rehype-obsidian` already strips it when rendering, and the projection now
mirrors that.

The identifier class is narrower than a permissive reading suggests, and the
corpus narrowed it: alphanumerics and hyphens only, because Obsidian keeps
`x ^a_b` as text. The first attempt used `[^\s^]+` and ate `^[[note]` along
with three other inline-footnote cases, which is what pointed at the tighter
class.

Ten cases move to matching.
