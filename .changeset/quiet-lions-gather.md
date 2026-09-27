---
"@quartz-community/remark-obsidian": minor
---

Match Obsidian on nested wikilink targets and line endings inside highlights.

**A wikilink target may not contain `[[`.** A single `[` is a legal target
character, but a doubled one is not, so `[[[[target]]` resolves to `[target` and
`![[![[target]]]]` resolves the inner embed to `target`. Rejecting the target lets
the tokenizer retry one position along until it finds a clean one, which is how
Obsidian arrives at the same results.

**A highlight keeps its line endings.** `==a\nb==` now yields a single highlight
containing `a\nb` rather than `ab`. `mdast-util-from-markdown` only preserves line
endings inside node types listed in `canContainEols`, and the highlight extension
did not declare itself; `mdast-util-gfm-strikethrough` declares `delete` for the
same reason, which is why strikethrough was unaffected.
