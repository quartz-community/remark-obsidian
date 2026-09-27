---
"@quartz-community/remark-obsidian": minor
---

Fix parser defects found by differential testing against real Obsidian.

**Comments no longer violate a micromark invariant.** An inline comment followed
by text on the same line, such as `%%note%% and more`, and empty markers such as
`%%%%`, corrupted micromark's token stream. Builds strip the assertion that
catches this, so the failure was silent in production and only surfaced when the
`development` export condition was resolved. Fifteen inputs were affected, all of
them ordinary usage. The flow construct now yields to the inline tokenizer when a
comment does not own the whole line, and no longer opens an empty content token.

**Highlights follow flanking rules and parse their content.** `==` is now an
attention construct, matching how micromark implements emphasis and
strikethrough. This brings three behaviour changes, each verified against
Obsidian 1.13.7:

- `before ==text == after` and `before == text== after` no longer highlight,
  because a delimiter adjacent to whitespace cannot open or close.
- `==a **b** c==` parses the nested emphasis instead of keeping it literal.
- A highlight may span a line ending, as it does in Obsidian.

Depending on `==text ==` producing a highlight is the one case where existing
output changes without the old output having been correct.

**A currency amount is no longer inline math.** `$5 and $10` parsed as math with
the body `5 and`, because `micromark-extension-math` applies no flanking rules. A
lone `$` followed by a digit or whitespace can no longer open. Note this gate is
bypassed if a consumer also registers stock `remark-math` for the same character,
since the fallback construct still matches.

**Wikilink targets are trimmed.** `[[ page ]]` resolves to `page`.

**Tags accept astral characters.** `#😐` produced no tag: micromark yields UTF-16
code units, so an emoji arrives as two surrogates and neither half matches a
unicode property escape.
