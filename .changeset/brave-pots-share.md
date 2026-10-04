---
"@quartz-community/remark-obsidian": patch
---

Fold a footnote definition whose body spans several blocks, and rejoin the
paragraph left beside it.

A definition that cannot interrupt a paragraph is folded back into it, but
only when its body was a single paragraph — anything else "has no unambiguous
inline form", so it was left alone. Obsidian needs no inline form: the whole
thing is prose to it. `prose` / `[^1]: lazy label` / `    ``` ` is one
paragraph there, where the fence made our definition two blocks and blocked
the fold. The source now goes back verbatim and the bare-reference pass
reduces the label as usual.

That exposed a second artefact. The fold reaches the fence line and the lazy
line below stays behind as a second paragraph, separated from the first by a
single newline — a shape no parse produces, since a blank line is what
separates paragraphs. Rejoining such a pair is safe for the same reason it is
needed: the state is unreachable from the parser, so nothing legitimate is
merged.

One corpus case, taking the corpus past 99%.
