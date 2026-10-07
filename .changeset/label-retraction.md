---
"@quartz-community/remark-obsidian": patch
---

Close a link label where raw scanning closes it

CommonMark lets a code span, an html attribute, a math span or a comment own a `]` and
carries the label past it. Obsidian's scan looks inside nothing, so that `]` closes the
label — and what follows is usually not `(`, which means no link at all:

```
[a`]`b](u)     entirely literal: the label is `a`` and a backtick follows
[foo`](u)`     a link to `u` labelled `foo``, with a backtick left over
```

Same comparison either way: where the tree's label runs past the raw close, the link is
rebuilt if a destination follows that close and removed if not.
