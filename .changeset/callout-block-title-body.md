---
"@quartz-community/remark-obsidian": patch
---

Keep the body under a callout whose title line is a block

`titleLineIsBlock` reparses the title line only, and whatever followed it in the same
paragraph went with the paragraph it replaced. `> [!note] # h` / `> body` lost `body`
outright, as did the lazy, list, comment and definition forms — content loss on input
anyone might write.

A body in a _separate_ paragraph was dropped by a second, narrower bug: the sibling blocks
were kept only when the lead text carried the newline, which is false exactly when a blank
quote line separates them.

The empty `calloutTitle` these create is now placed, zero-width at the title's own offset.
An empty title is not an absent one, and an unplaced node is one a formatter cannot edit
around.
