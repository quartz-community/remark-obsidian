---
"@quartz-community/remark-obsidian": patch
---

Rejoin a footnote reference a construct split apart

Obsidian parses nothing inside a footnote reference's label, so `[^%%note%%]` is a
reference to the label `%%note%%`. We let the label tokenise, and whatever formed there
took the closing bracket out of reach of the bare-reference pass — which only ever sees a
single text node — so no reference formed at all:

```
[^%%note%%]   text "[^" + comment + text "]"
[^==mark==]   text "[^" + highlight + text "]"
[^<br>]       text "[^" + html + text "]"
[^_under_]    text "[^" + emphasis + text "]"
```

Deliberately narrow: it fires only where such a run is currently split, which is exactly
where no reference exists today. Unreachable footnote labels in the corpus drop from seven
to two.
