---
"@quartz-community/remark-obsidian": patch
---

Close frontmatter on a `---` that carries a tail, and parse the tail.

`micromark-extension-frontmatter` requires its closing fence to be alone on
the line: anything after it fails the whole construct, so `---` / `a: b` /
`---[^2]: x` arrived as a thematic break and the document lost its
frontmatter entirely. Obsidian closes at the `---` and reads the rest of that
line as ordinary Markdown.

Absorbing the extension was considered and tested first — it is small, and the
change looked like three lines in its `closeAfter` state. It does not work: a
flow construct cannot legally stop mid-line, so returning `ok` there makes
micromark discard the construct and fall back to a thematic break just the
same. Making it legal would mean restructuring how that construct tokenizes
its closing line, which is far more than the small patch the package's size
suggests. This repairs the tree instead, the same shape as the other
re-parsing passes here, and keeps the dependency unforked.

One detail is measured: Obsidian's following block starts where the fence
ends rather than where its content does, so `--- trailing` reports a paragraph
of `" trailing"` including the space.
