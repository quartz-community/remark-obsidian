---
"@quartz-community/remark-obsidian": patch
---

Reproduce Obsidian's escaped closing delimiters for wikilinks, embeds and
highlights.

A backslash does not stop `]]` or `==` closing in Obsidian, so `[[target\]]` is a
link and `==text\==` is a highlight holding `text\`. CommonMark escapes any ASCII
punctuation, so we were leaving all three as literal text.

This was previously triaged `report-upstream` on the reasoning that the
inline-math exception — `$x\$` _does_ honour the escape — suggests the behaviour
is unintended. That conflated two separate questions. Whether Obsidian should
change is for the Obsidian team; whether this package reproduces today's Obsidian
is not, and compat mode answers it the same way everywhere else. A note whose
`[[target\]]` resolves in the app has to resolve here too.

Reproducing it surfaced a second asymmetry inside the first, now recorded in
`COMMONMARK-DIVERGENCES.md` as sharper evidence for the same conclusion: for
highlights the escape is honoured on an _opening_ run and ignored on a _closing_
one, and ignored on the closer only while a highlight is actually open. All
three of `==text\==`, `\==text==` and `\==text\==` behave differently, which no
single "this delimiter ignores escapes" rule can produce.

Wikilinks also needed the display and resolved forms separated: Obsidian resolves
`[[target\]]` to `target` but shows `target\`. `path` is now the resolved target
and the previously unused `value` carries what a consumer should render.

Five corpus cases.
