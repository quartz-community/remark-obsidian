---
"@quartz-community/remark-obsidian": patch
---

Vendor the inline-math tokenizer to implement Obsidian's flanking, escape and
closing-run rules.

`micromark-extension-math` applies no flanking rules and asserts its own `previous`
guard internally, so these rules could not be added by wrapping it. Its `math-text`
tokenizer and resolver are now adapted into `src/lib/syntax/math-text.ts`, with
attribution in `LICENSE-THIRD-PARTY.md`. Token names are unchanged so
`mdast-util-math` still maps them, and block math continues to use the upstream flow
construct because every block case already matched.

All three of Obsidian's inline-math divergences are implemented:

- A lone `$` followed by a digit or whitespace does not open, so `$5 and $10` and
  `costs $20,000 today` are currency rather than math.
- A backslash escapes the closing delimiter, so `$x^2\$` is not math. Obsidian
  honours the escape for math while ignoring it for wikilinks, embeds, highlights
  and comments.
- A closing run consumes only as many markers as the opener used and leaves the rest
  as literal text, so `$x^2$$` is math followed by `$` and `$x$$next` is math
  followed by `$next`.

Upstream also refuses to open when the preceding character is `$`, which stops an
over-long opening run from pairing, so `$$x^2$` finds no math. That guard is now
relaxed, but only when stock `remark-math` is not also registered for `$`: micromark
still attempts its tokenizer in that case, and its internal assertion fires on a
state we legitimately create. The condition is evaluated during tokenization, where
the merged construct list is visible, rather than at plugin setup — this package
initialises before a consumer's math plugin does, so it cannot know at setup time.

That means no release coordination is needed. With the duplicate present the guard
stays strict and nothing crashes; when a consumer stops registering a second math
parser, `$$x^2$` starts parsing on its own. Measured across the corpus, removing the
duplicate registration unlocks six cases, 273 to 279, with no crashes either way.

The flanking rules are inert wherever a consumer also registers stock `remark-math`
for `$`, because micromark falls through to the ungated construct. Measured against
the corpus, that duplicate registration costs four cases, two of them the currency
ones.
