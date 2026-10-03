---
"@quartz-community/remark-obsidian": patch
---

Revive a footnote reference whose definition was recovered from inside a comment.

`bareFootnoteRefTransform` reduced every unresolved `[^name]` in a text node to its
bare name, on the reasoning that GFM has already turned any resolvable reference
into a `footnoteReference` node. That stopped being true once the comment
transforms started re-inserting definitions: GFM binds references while the
definition is still hidden inside a `%%` comment, so by the time
`commentTailTransform` puts `[^1]: def` back, the reference is still sitting in a
text node and was being flattened. Obsidian shows a live reference there.

Each match is now routed on whether the tree defines it — defined becomes a real
`footnoteReference`, undefined is reduced as before. Four corpus cases, all shapes
where the definition trails a comment closer or arrives later than the reference.
