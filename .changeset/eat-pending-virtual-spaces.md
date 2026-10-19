---
"@quartz-community/remark-obsidian": patch
---

A partly-consumed tab no longer leaks its remaining width into a list item's content.

The preprocessor turns one tab into a single tab code followed by virtual spaces filling to the
next stop, and a container's indent is consumed by code count rather than by column. So an item
whose content column is two takes the tab and one space, leaving three virtual spaces for the
flow to read as indentation — enough, with a following real space, to make the line indented
code.

`-` over a blank over tab-two-spaces `[^1]: def` is a definition at column 1 in Obsidian, and
was being swallowed by a code block. Consuming the pending virtual spaces once the item's own
indent is satisfied fixes it.

This closes `probe/item-tab-threshold/tab-three`, a case recorded as a known gap when the tab
family was first explored, and lowers two compute ceilings by one.
