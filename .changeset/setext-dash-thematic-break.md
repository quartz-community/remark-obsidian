---
"@quartz-community/remark-obsidian": patch
---

A dash underline over a multi-line paragraph is a thematic break

Obsidian makes a heading only from a single content line, which this package already
reproduced — but it was folding the leftover underline into the paragraph as text.
For a dash underline that is wrong: Obsidian reports a `paragraph` and a
`thematicBreak`.

| source        | Obsidian                      |
| ------------- | ----------------------------- |
| `a` `---`     | `heading` (h2)                |
| `a` `b` `---` | `paragraph` + `thematicBreak` |
| `a` `b` `===` | `paragraph`, `===` stays text |

The asymmetry is real: `===` has no block form of its own, so it can only be text,
and that case already matched.

21 cases move from `replicate` to `match` with no regression.
