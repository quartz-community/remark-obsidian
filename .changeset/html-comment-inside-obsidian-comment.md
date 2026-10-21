---
"@quartz-community/remark-obsidian": patch
---

An HTML comment inside a `%%` comment no longer cuts it short.

`commentRegionTransform` rebuilds the document around a `<!-- ... -->` region whose shape the tree
does not already represent. A `<!-- x -->` written _inside_ an Obsidian `%%` comment is already
represented — as that comment's own text — but the pass could not see that, rebuilt around it, and
in doing so cut the `%%` node at the opener and promoted the HTML to a root sibling. Everything
below it was then released:

```
%%
Text <!-- x -->
[^a]: def
```

Obsidian buries `[^a]` here, as it does without the HTML comment; we defined it. The same cut ran
the other way when the `%%` was closed — its real closer was then read as a fresh opener and
buried a label Obsidian keeps — so one containment test fixes both directions.

Found by reducing real corpus documents against the live application rather than by hand-built
probes: an HTML comment nested in a `%%` region turned up in about a fifth of the reductions for
this family, and six rounds of hand-built minimal forms had never produced that shape.

Differential harness: 6066 → 6080 of 6818 documents, reference assertions 17987 → 18003.
