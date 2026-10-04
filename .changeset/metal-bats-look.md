---
"@quartz-community/remark-obsidian": patch
---

Compare `metadataCache`, the oracle that was recorded but never read.

Every golden carried Obsidian's own `metadataCache` view — headings, links,
embeds, tags, footnote refs — and nothing compared it. It is independent of
the DOM, built from Obsidian's parse rather than from what the renderer
produced, so it sees what a text projection cannot: a link inside a footnote
definition nothing references, a heading the view never paints.

Turning it on finds 26 divergences across 1531 cases that every other
projection agreed on, in five areas: a trailing `#` in a wikilink target, an
escaped `#` inside one, an embed whose alias contains a wikilink, purely
numeric and empty-segment tag paths, and several heading-recognition cases
around tabs and comments.

`projectMdast` grows an opt-out for its unreferenced-definition skip, which is
right for rendered text and wrong for a source index.
