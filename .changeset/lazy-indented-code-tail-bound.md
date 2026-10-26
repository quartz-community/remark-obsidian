---
"@quartz-community/remark-obsidian": patch
---

Stop `quoteLazyIndentedCodeTransform` duplicating a container's tail into the tree.

The pass clamps a container back to the cut and re-parses whatever it deleted, reading the
extent from `position.end`. `containerLazyTransform` stretches that position over every block
it absorbs, so the claim can reach lines the container never held -- and rebuilding from it
re-parsed nodes that were still root siblings, splicing a second copy of them beside the
container. One source line was then represented twice in the tree.

The bound now comes from what `clamp` actually removed, counting both deleted children and
truncated leaf values.
