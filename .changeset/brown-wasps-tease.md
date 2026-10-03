---
"@quartz-community/remark-obsidian": patch
---

Make a heading of a one-line footnote definition under a setext underline.

`[^1]: x` followed by `===` is a heading reading `[^1]: x` in Obsidian, not a
definition. GFM gives the definition priority and swallows the underline as lazy
continuation, or — for `---` — leaves a thematic break behind, so both shapes are
recognised.

The rule is narrower than it first looks, and the boundary is measured rather than
assumed: only a **one-line** definition is swallowed whole. Given a continuation
line the underline belongs to that line instead, so `[^1]: x` / `    y` / `--`
stays a definition, and `[^1]: body` / `lazy` / `===` heads only `lazy`. The pass
also has to run after the interrupt fold, or a definition about to be merged into
the paragraph above it becomes a heading instead. Ignoring either constraint costs
twelve cases that currently match.

The heading keeps the raw line rather than the definition's parsed content,
because the definition dropped `[^1]: ` as its label while Obsidian shows it; the
bare-reference pass then reduces that to `1: `, and any reference pointing at the
vanished definition is left to be orphaned. Six corpus cases.
