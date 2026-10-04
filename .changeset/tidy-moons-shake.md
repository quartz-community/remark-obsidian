---
"@quartz-community/remark-obsidian": major
---

Keep a footnote reference nothing defines, instead of baring it in the tree.

Obsidian consumes a reference's delimiters even when nothing defines it, so
`see [^x]` displays as `see x`. That was reproduced by rewriting the text node
to `see x` — but a node value is not a rendering. The node went on claiming the
span `see [^x]` while no longer reproducing it, so a formatter serialising this
tree wrote the shorter text back and destroyed a reference the author had
merely not defined yet, which is ordinary in a real note: written before the
definition, or simply mistyped.

An undefined reference now stays a `footnoteReference`, which round-trips to
`[^x]` exactly, label case included. Baring it is the renderer's job;
`rehype-obsidian` does it, so rendered output is unchanged.

`footnoteOrphanTransform` is removed with its export: it re-flattened an
undefined reference one layer later, and did so from the label rather than the
identifier, which showed the wrong case.

Breaking twice over, which is why this is a major: an undefined reference used
to arrive as a `text` node and now arrives as a `footnoteReference`, so a
consumer matching on bare text must match on the node instead; and
`footnoteOrphanTransform` is gone from the public exports.
