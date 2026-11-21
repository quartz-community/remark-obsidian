---
"@quartz-community/remark-obsidian": patch
---

Types: a `callout` or a standalone `comment` inside a list item, quote or footnote definition is now allowed by the types, as both presets build them there. They were registered as root content only, so `item.children.some((c) => c.type === "callout")` did not compile. Also declared: `data.display` on `inlineMath` (`$$` math inside a paragraph, which Obsidian renders as display), and the writer's spelling hints, `data.spelledPath`, `spelledHeading` and `strippedBackslash` on `wikilink` (the new `WikilinkData` type) and `data.spelledLabel` on link and image references. The runtime code is unchanged: `dist/*.js` is byte-identical.
