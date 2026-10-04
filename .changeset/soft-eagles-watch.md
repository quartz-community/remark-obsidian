---
"@quartz-community/remark-obsidian": patch
---

Pin the behaviour 1.14's coloured highlights will change.

1.14 colours a highlight from a leading emoji, as Bear does, and it is a parse
change rather than only a rendering one: the emoji is consumed, so it leaves
both the rendered text and the highlight's content. Recording the whole corpus
against 1.13.7 and against the 1.14.4 beta and diffing shows that of 1503 cases
only the highlight probes differ — 1.14 changes nothing else this harness can
see.

34 cases pin it. Only a leading emoji is consumed, only the first of two, the
separating space is kept, and exactly twelve pictographs count: the six rainbow
circles and six rainbow squares. Brown, black and white are not markers.

No behaviour change here, deliberately. 1.13.7 does not consume the emoji, so
stripping it now would be wrong for current Obsidian, and when it does ship the
drop belongs in `rehype-obsidian` — the file keeps its text, so consuming the
emoji in the tree would let a formatter delete it. The cases are recorded
against 1.13.7 and will diverge the moment 1.14 becomes `latest`.
