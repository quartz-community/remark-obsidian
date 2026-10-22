---
"@quartz-community/remark-obsidian": patch
---

A `%%` or `<!--` inside math opens nothing.

`$$ … $$` is TeX, not markdown, so a region marker inside it is literal text — the same reason
code spans and fenced code were already shielded from the region scanners. Math was missing from
that set, which let the HTML-comment rebuild cut a math node in half, exactly as it cut `%%`
comment nodes before comment spans were added:

```
$$
Some words <!-- x -->
$$
[^a]: def
```

Obsidian defines `a` here; we lost it. The inverse also occurred — a reference invented inside
`<!-- [^name] -->` when that comment sat inside math.

Differential harness: 6133 → 6142 of 6818 documents with no regressions.
