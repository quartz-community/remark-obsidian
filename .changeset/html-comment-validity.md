---
"@quartz-community/remark-obsidian": patch
---

An html comment Obsidian's parser rejects renders as visible text.

remark-parse@8 keeps CommonMark 0.28's restriction and micromark dropped it: a comment's
body may not contain `--`, start with `>` or `->`, or end with `-`. So
`foo <!-- a -- b --> bar` and `foo <!--> foo -->` read in full rather than vanishing.

Done in the projection, so the tree and the serialiser are untouched -- which is what
lifts the standing refusal on `raw-html/626`, whose earlier fix converted the node to text
and grew a backslash on every format pass.
